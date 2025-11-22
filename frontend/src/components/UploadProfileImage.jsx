// frontend/src/components/UploadProfileImage.jsx
import { useState } from "react";
import axios from "axios";

export default function UploadProfileImage() {
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
    }
  };

  const handleUpload = async () => {
    if (!image) {
      alert("Please select an image first.");
      return;
    }

    const formData = new FormData();
    formData.append("profileImage", image);

    setLoading(true);

    try {
      const response = await axios.post(
        "http://localhost:5000/api/user/upload-image", // backend API
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      setImageUrl(response.data.imageUrl); // Get the uploaded image URL
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Upload Profile Image</h2>
      <input type="file" onChange={handleImageChange} />
      <button onClick={handleUpload} disabled={loading}>
        {loading ? "Uploading..." : "Upload"}
      </button>

      {imageUrl && (
        <div>
          <h3>Uploaded Image:</h3>
          <img src={imageUrl} alt="Profile" width="150" height="150" />
        </div>
      )}
    </div>
  );
}
