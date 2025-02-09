import React, { useState } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const Upload = () => {
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    artist: "",
    producer: "",
    featuring: [],
    rightsHolder: "",
    album: "",
    genre: "",
    releaseDate: "",
    duration: "",
    coverArt: "",
    explicit: false,
    isrc: "",
    upc: "",
    bpm: "",
    pitch: "",
    key: "",
    elements: [],
    tags: [],
    timeSignature: "4/4",
    bitrate: "",
    sampleRate: "",
  });

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleCheckboxChange = (e) => {
    setFormData({ ...formData, explicit: e.target.checked });
  };

  const handleTagInput = (e, field) => {
    if (e.key === "Enter" && e.target.value.trim()) {
      setFormData({
        ...formData,
        [field]: [...formData[field], e.target.value.trim()],
      });
      e.target.value = "";
    }
  };

  const removeTag = (field, index) => {
    const updatedTags = [...formData[field]];
    updatedTags.splice(index, 1);
    setFormData({ ...formData, [field]: updatedTags });
  };

  const handleUpload = async () => {
    if (!file || !formData.title || !formData.artist) {
      toast.error("Please select a file and enter required fields.");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    const processedData = {
      ...formData,
      featuring: JSON.stringify(formData.featuring),
      elements: JSON.stringify(formData.elements),
      tags: JSON.stringify(formData.tags),
    };

    Object.entries(processedData).forEach(([key, value]) => {
      form.append(key, value);
    });

    setUploading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        "http://localhost:8000/api/songs/upload",
        form,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
          onUploadProgress: (progressEvent) => {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percent);
          },
        }
      );

      toast.success("Upload successful!");

      setFormData({
        title: "",
        artist: "",
        producer: "",
        featuring: [],
        rightsHolder: "",
        album: "",
        genre: "",
        releaseDate: "",
        duration: "",
        coverArt: "",
        explicit: false,
        isrc: "",
        upc: "",
        bpm: "",
        pitch: "",
        key: "",
        elements: [],
        tags: [],
        timeSignature: "4/4",
        bitrate: "",
        sampleRate: "",
      });
      setFile(null);
    } catch (error) {
      toast.error("Upload failed. Please try again.");
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <ToastContainer />
      <h2>Upload a Song</h2>
  
      {/* File Selection */}
      <div className="upload-box">
        <input type="file" accept="audio/mp3, audio/wav" onChange={handleFileChange} />
        {file && <p>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
      </div>
  
      {/* Standard Inputs */}
      <input type="text" name="title" placeholder="Title (Required)" value={formData.title} onChange={handleInputChange} required />
      <br></br>
      <input type="text" name="artist" placeholder="Artist (Required)" value={formData.artist} onChange={handleInputChange} required />
      <br></br>
      <input type="text" name="producer" placeholder="Producer" value={formData.producer} onChange={handleInputChange} />
      <br></br>
      <input type="text" name="rightsHolder" placeholder="Rights Holder" value={formData.rightsHolder} onChange={handleInputChange} />
      <br></br>
      <input type="text" name="album" placeholder="Album" value={formData.album} onChange={handleInputChange} />
      <br></br>
      <input type="text" name="genre" placeholder="Genre" value={formData.genre} onChange={handleInputChange} />
      <br></br>
      <input type="date" name="releaseDate" placeholder="Release Date" value={formData.releaseDate} onChange={handleInputChange} />
      <label>  Release Date</label><br></br>
      <input type="number" name="duration" placeholder="Duration (Seconds)" value={formData.duration} onChange={handleInputChange} />
      <br></br>
      <input type="url" name="coverArt" placeholder="Cover Art URL" value={formData.coverArt} onChange={handleInputChange} />
      <br></br>
      {/* Metadata Inputs */}
      <input type="text" name="isrc" placeholder="ISRC" value={formData.isrc} onChange={handleInputChange} />
      <br></br>
      <input type="text" name="upc" placeholder="UPC" value={formData.upc} onChange={handleInputChange} />
      <br></br>
      <input type="number" name="bpm" placeholder="BPM" value={formData.bpm} onChange={handleInputChange} />
      <br></br>
      <input type="number" name="pitch" placeholder="Pitch" value={formData.pitch} onChange={handleInputChange} />
      <br></br>
      <input type="text" name="key" placeholder="Key" value={formData.key} onChange={handleInputChange} />
  
      {/* Multi-Entry Inputs */}
      {["featuring", "elements", "tags"].map((field) => (
        <div key={field} className="tag-input">
          <input type="text" placeholder={`${field} (Press Enter to add)`} onKeyDown={(e) => handleTagInput(e, field)} />
          <div className="tags">
            {formData[field].map((item, index) => (
              <span key={index} className="tag">
                {item} <button onClick={() => removeTag(field, index)}>×</button>
              </span>
            ))}
          </div>
        </div>
      ))}
<p>
</p>
       {/* Explicit Checkbox */}
       <label>
        <input type="checkbox" name="explicit" checked={formData.explicit} onChange={handleCheckboxChange} />
        Explicit Lyrics?
      </label><p></p>
  
      {/* Upload Progress */}
      {uploading && (
        <div className="progress-bar">
          <div className="progress" style={{ width: `${uploadProgress}%` }}></div>
        </div>
      )}
  
      {/* Upload Button */}
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? `Uploading... ${uploadProgress}%` : "Upload"}
      </button>
    </div>
  );  
};

export default Upload;
