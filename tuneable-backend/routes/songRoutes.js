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

const storage = multer.memoryStorage(); // Store file in memory

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 33 * 1024 * 1024 }, // Limit: 33MB
});

// @route   POST /api/songs/upload
// @desc    Upload a song file and store metadata
// @access  Private (User must be logged in)
router.post("/upload", authMiddleware, async (req, res) => {
   console.log("🔐 User Info from Auth Middleware:", req.user);
  upload.single("file")(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(500).json({ message: "File upload failed", error: err.message });
    }

    try {
      console.log("🔵 Upload Route Hit!");

      if (!req.file) {
        console.log("⛔ No file received!");
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("🟢 File Received:", req.file);
      console.log("🟡 Form Data:", req.body);

      const { title, artist } = req.body;
      if (!title || !artist) {
        return res.status(400).json({ message: "Title and artist are required" });
      }

      const objectId = new mongoose.Types.ObjectId();

      // Create a new song entry first to generate an `_id`
      const newSong = new Song({
        _id: objectId,
        title,
        artist,
        addedBy: req.user._id,
      });
      await newSong.save();

      // Generate a safe filename
      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
      const safeArtist = artist.replace(/[^a-zA-Z0-9]/g, "_");
      const songID = newSong._id.toString();
      const ext = path.extname(req.file.originalname);
      const finalFilename = `${safeArtist}-${safeTitle}-${songID}${ext}`;

      console.log("🟠 Final Filename:", finalFilename);

      // Save the file to disk manually
      const filePath = `uploads/${finalFilename}`;
      require("fs").writeFileSync(filePath, req.file.buffer); // Save from memory storage

      // Update song metadata
      newSong.sources.set("local", `/uploads/${finalFilename}`);
      await newSong.save();

      console.log("✅ Song successfully uploaded:", newSong);
      return res.status(201).json({ message: "Song uploaded successfully", song: newSong });

    } catch (error) {
      console.error("🚨 Upload error:", error);
      return res.status(500).json({ message: "Something went wrong!", error: error.message });
    }
  });
});

// @route   GET /api/songs
// @desc    Fetch all songs for TuneFeed with filtering & sorting
// @access  Private
router.get("/", authMiddleware, async (req, res) => {
  console.log("Route Hit:", req.originalUrl);

  try {
    const { sortBy, filterBy, limit = 50 } = req.query;

    let query = {};

    // Apply filters (e.g., tag, BPM range, etc.)
    if (filterBy) {
      try {
        const filters = JSON.parse(filterBy); // Expecting JSON in query
        if (filters.tag) query.tag = filters.tag;
        if (filters.bpmMin && filters.bpmMax) {
          query.bpm = { $gte: filters.bpmMin, $lte: filters.bpmMax };
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid filter format" });
      }
    }

    let sortCriteria = {};
    switch (sortBy) {
      case "highestBid":
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

    //  the song details with populated bid info
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

    res.status(200).json({ message: "Song details ed successfully!", song });
  } catch (err) {
    console.error("Error ing song details:", err.message);
    res.status(500).json({ error: "Error ing song details", details: err.message });
  }
});

module.exports = router;
