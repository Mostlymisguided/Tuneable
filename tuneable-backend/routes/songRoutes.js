const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const Song = require("../models/Song");
const Party = require("../models/Party");
const { isValidObjectId } = require("../utils/validators");

// Configure Multer for File Uploads
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp3"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only MP3 and WAV are allowed."), false);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Store in 'uploads/' directory
  },
  filename: async (req, file, cb) => {
    try {
      const { title, artist } = req.body;
      if (!title || !artist) {
        return cb(new Error("Title and artist are required for file naming."), null);
      }

      // Create a new song entry first to generate an `_id`
      const newSong = new Song({ title, artist, addedBy: req.user._id });
      await newSong.save();

      // Generate a safe filename (remove spaces & special chars)
      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
      const safeArtist = artist.replace(/[^a-zA-Z0-9]/g, "_");
      const songID = newSong._id.toString();

      // Construct filename: artist-title-songID.ext
      const ext = path.extname(file.originalname);
      const finalFilename = `${safeArtist}-${safeTitle}-${songID}${ext}`;

      cb(null, finalFilename);
    } catch (error) {
      console.error("Error generating filename:", error);
      cb(error, null);
    }
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit: 10MB
});

// @route   POST /api/songs/upload
// @desc    Upload a song file and store metadata
// @access  Private (User must be logged in)
router.post("/upload", authMiddleware, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
  
      // Extract the song ID from the filename
      const songID = req.file.filename.split("-").pop().split(".")[0];
      let song = await Song.findById(songID);
      
      if (!song) {
        return res.status(404).json({ message: "Song metadata not found." });
      }
  
      // Parse multi-value fields from JSON format (sent by frontend)
      const { featuring, elements, tags, ...otherData } = req.body;
  
      const parsedData = {
        ...otherData,
        featuring: featuring ? JSON.parse(featuring) : [],
        elements: elements ? JSON.parse(elements) : [],
        tags: tags ? JSON.parse(tags) : [],
      };
  
      // Update song metadata
      Object.assign(song, parsedData);
  
      // Add local file path to `sources.local`
      song.sources.set("local", `/uploads/${req.file.filename}`);
  
      await song.save();
  
      res.status(201).json({ message: "Song uploaded successfully", song });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });  

// @route   GET /api/songs
// @desc    Fetch all songs for TuneFeed with filtering & sorting
// @access  Private
router.get("/", authMiddleware, async (req, res) => {
  console.log("Route Hit:", req.originalUrl);

  try {
    const { sortBy, filterBy, limit = 50 } = req.query;

    let query = {};

    // Apply filters (e.g., genre, BPM range, etc.)
    if (filterBy) {
      try {
        const filters = JSON.parse(filterBy); // Expecting JSON in query
        if (filters.genre) query.genre = filters.genre;
        if (filters.bpmMin && filters.bpmMax) {
          query.bpm = { $gte: filters.bpmMin, $lte: filters.bpmMax };
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid filter format" });
      }
    }

    let sortCriteria = {};
    switch (sortBy) {
      case "highestPaid":
        sortCriteria = { globalBidValue: -1 };
        break;
      case "newest":
        sortCriteria = { uploadedAt: -1 };
        break;
      case "mostPlayed":
        sortCriteria = { popularity: -1 };
        break;
      default:
        sortCriteria = { uploadedAt: -1 };
    }

    // Fetch songs with sorting and filtering applied
    const songs = await Song.find(query)
      .populate({
        path: "bids",
        populate: {
          path: "userId",
          model: "User",
          select: "username",
        },
      })
      .populate({
        path: "addedBy",
        model: "User",
        select: "username",
      })
      .sort(sortCriteria)
      .limit(Number(limit));

    console.log("Fetched songs for TuneFeed:", JSON.stringify(songs, null, 2));

    res.status(200).json({
      message: "Songs fetched successfully!",
      songs,
    });
  } catch (err) {
    console.error("Error fetching TuneFeed songs:", err.message);
    res.status(500).json({ error: "Error fetching TuneFeed songs", details: err.message });
  }
});

// @route   GET /api/songs/:partyId/songs/:songId
// @desc    Fetch details of a specific song in a party
// @access  Private
router.get("/:partyId/songs/:songId", authMiddleware, async (req, res) => {
  console.log("Route Hit:", req.originalUrl);
  console.log("Party ID:", req.params.partyId);
  console.log("Song ID:", req.params.songId);

  try {
    const { partyId, songId } = req.params;

    if (!isValidObjectId(partyId) || !isValidObjectId(songId)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    // Validate that the party exists
    const party = await Party.findById(partyId);
    if (!party) return res.status(404).json({ error: "Party not found" });

    // Fetch the song details with populated bid info
    const song = await Song.findById(songId)
      .populate({
        path: "bids",
        populate: {
          path: "userId",
          model: "User",
          select: "username",
        },
      })
      .populate({
        path: "addedBy",
        model: "User",
        select: "username",
      });

    console.log("Populated song:", JSON.stringify(song, null, 2));

    if (!song) return res.status(404).json({ error: "Song not found" });

    res.status(200).json({ message: "Song details fetched successfully!", song });
  } catch (err) {
    console.error("Error fetching song details:", err.message);
    res.status(500).json({ error: "Error fetching song details", details: err.message });
  }
});

module.exports = router;
