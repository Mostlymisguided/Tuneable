import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserProfile = () => {
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    avatar: '',
    bio: '',
    preferences: {
      theme: 'light',
      notifications: true,
    },
  });
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token'); // Retrieve JWT from local storage
        const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProfile(response.data.user);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching profile:', error);
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('preferences.')) {
      const key = name.split('.')[1];
      setProfile((prevState) => ({
        ...prevState,
        preferences: { ...prevState.preferences, [key]: value },
      }));
    } else {
      setProfile({ ...profile, [name]: value });
    }
  };

  const saveProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${process.env.REACT_APP_BACKEND_URL}/profile`, profile, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEditMode(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  if (loading) {
    return <p>Loading profile...</p>;
  }

  return (
    <div>
      <h2>User Profile</h2>
      <form>
        <label>
          Username:
          <input
            type="text"
            name="username"
            value={profile.username}
            onChange={handleInputChange}
            disabled
          />
        </label>
        <label>
          Email:
          <input
            type="email"
            name="email"
            value={profile.email}
            onChange={handleInputChange}
            disabled={!editMode}
          />
        </label>
        <label>
          Avatar URL:
          <input
            type="text"
            name="avatar"
            value={profile.avatar}
            onChange={handleInputChange}
            disabled={!editMode}
          />
        </label>
        <label>
          Bio:
          <textarea
            name="bio"
            value={profile.bio}
            onChange={handleInputChange}
            disabled={!editMode}
          />
        </label>
        <label>
          Theme:
          <select
            name="preferences.theme"
            value={profile.preferences.theme}
            onChange={handleInputChange}
            disabled={!editMode}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Notifications:
          <input
            type="checkbox"
            name="preferences.notifications"
            checked={profile.preferences.notifications}
            onChange={(e) =>
              handleInputChange({
                target: { name: 'preferences.notifications', value: e.target.checked },
              })
            }
            disabled={!editMode}
          />
        </label>
        <div>
          <button type="button" onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Cancel' : 'Edit'}
          </button>
          {editMode && <button type="button" onClick={saveProfile}>Save</button>}
        </div>
      </form>
    </div>
  );
};

export default UserProfile;
