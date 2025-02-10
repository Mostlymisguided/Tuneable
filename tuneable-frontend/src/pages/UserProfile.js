import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import "../styles/UserProfile.css";

const UserProfile = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [amount, setAmount] = useState(""); // Input for wallet top-up
    const [newProfilePic, setNewProfilePic] = useState(null);
    const [uploading, setUploading] = useState(false);
    const navigate = useNavigate();

    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL; // Ensure this is set in .env

    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const response = await API.get("/api/users/profile", {
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                });
                console.log("✅ User data fetched:", response.data);
                setUser(response.data.user);
            } catch (err) {
                console.error("❌ Error fetching profile:", err);
                setError("Failed to fetch user profile");
            } finally {
                setLoading(false);
            }
        };
        fetchUserProfile();
    }, []);

    const handleProfilePicChange = (e) => {
        setNewProfilePic(e.target.files[0]);
    };

    const handleProfilePicUpload = async () => {
        if (!newProfilePic) {
            alert("Please select an image file.");
            return;
        }

        const formData = new FormData();
        formData.append("profilePic", newProfilePic);

        setUploading(true);
        try {
            const response = await API.put("/api/users/profile-pic", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            console.log("✅ Profile picture updated:", response.data);
            setUser((prevUser) => ({
                ...prevUser,
                profilePic: response.data.user.profilePic,
            }));
            alert("Profile picture updated successfully!");
        } catch (err) {
            console.error("❌ Error updating profile picture:", err);
            alert("Failed to update profile picture.");
        } finally {
            setUploading(false);
        }
    };

    const handleTopUp = async () => {
        if (!amount || amount <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        try {
            const response = await API.post("/api/payments/create-payment-intent", 
                { amount: parseFloat(amount), currency: "gbp" },
                { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
            );

            console.log("💳 Payment intent created:", response.data);
            navigate(`/payment?clientSecret=${response.data.clientSecret}&amount=${amount}`);
        } catch (err) {
            console.error("❌ Error creating payment intent:", err);
            alert("Failed to create payment intent");
        }
    };

    if (loading) return <p>Loading...</p>;
    if (error) return <p>{error}</p>;
    if (!user) return <p>No user data available</p>;

    // Construct full profile picture URL
    const profilePicUrl = user.profilePic ? `${BACKEND_URL}${user.profilePic}` : "/default-avatar.png";

    return (
        <div className="user-profile">
            <header className="profile-header">
                <img src={profilePicUrl} alt="Profile" className="profile-pic" />
                <div className="profile-info">
                    <h1>{user.username || "Unknown User"}</h1>
                    <p>{user.cellPhone || "Location not set"}</p>
                    <p>{user.givenName || "Given Name not set"}</p>
                    <p>{user.familyName || "Family Name not set"}</p>
                    <p>{user.homeLocation.city || "Location not set"}</p>
                    <p>{user.homeLocation.country || "Location not set"}</p>
                    <span>
                        {user.role || "User"} | 
                        {user.stats?.plays ?? 0} plays | 
                        {user.stats?.likes ?? 0} likes
                    </span>
                </div>
            </header>

            <section className="profile-pic-upload">
                <h3>Change Profile Picture</h3>
                <input type="file" accept="image/*" onChange={handleProfilePicChange} />
                <button onClick={handleProfilePicUpload} disabled={uploading}>
                    {uploading ? "Uploading..." : "Upload New Picture"}
                </button>
            </section>

            <section className="wallet">
                <h2>Account Balance</h2>
                <p><strong>£{user.balance?.toFixed(2) ?? "0.00"}</strong></p>
                <h3>Top Up Balance</h3>
                <input 
                    type="number" 
                    placeholder="Enter amount" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                />
                <button onClick={handleTopUp}>Add Funds</button>
            </section>

            <section className="top-artists">
                <h2>Top Artists</h2>
                <div className="artist-graph">{/* Visualization logic */}</div>
            </section>
            
            <section className="music-tags">
                <h2>Tags</h2>
                <div className="tags">
                    {user.tags?.length ? user.tags.map(tag => <span key={tag} className="tag">{tag}</span>) : <p>No tags available</p>}
                </div>
            </section>
            
            <section className="library-search">
                <input type="text" placeholder="Search…" />
                <button>My Library</button>
            </section>
        </div>
    );
};

export default UserProfile;
