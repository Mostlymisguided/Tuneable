import React, { useState } from 'react';
import axios from 'axios';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    inviteCode: '',
    profilePicture: null, // Changed from string to file
    cellPhone: '',
    givenName: '',
    familyName: '',
    homeLocation: '',
    city: '',
    country: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, profilePicture: e.target.files[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const data = new FormData();
    data.append('username', formData.username);
    data.append('email', formData.email);
    data.append('password', formData.password);
    data.append('inviteCode', formData.inviteCode);
    data.append('cellPhone', formData.cellPhone);
    data.append('givenName', formData.givenName);
    data.append('familyName', formData.familyName);
    data.append('homeLocation[city]', formData.city);
    data.append('homeLocation[country]', formData.country);
    if (formData.profilePicture) {
      data.append('profilePic', formData.profilePicture);
    }

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/register`,
        data,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );
      console.log('Registration successful:', response.data);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  if (success) {
    return <p>Registration successful! Please <a href="/login">log in</a>.</p>;
  }

  return (
    <div>
      <h1>Register</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <div>
          <label>Username:</label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label>Email:</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label>Password:</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label>Invite Code</label>
          <input
            type="text"
            name="inviteCode"
            value={formData.inviteCode}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label>Cell Phone:</label>
          <input
            type="text"
            name="cellPhone"
            value={formData.cellPhone}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>Given Name:</label>
          <input
            type="text"
            name="givenName"
            value={formData.givenName}
            onChange={handleChange}
          />
        </div>
            <div>
          <label>Family Name:</label>
          <input
            type="text"
            name="familyName"
            value={formData.familyName}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>Profile Picture:</label>
          <input
            type="file"
            name="profilePicture"
            onChange={handleFileChange}
            accept="image/*"
          />
        </div>
        <div>
          <label>Home City:</label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>Home Country:</label>
          <input
            type="text"
            name="country"
            value={formData.country}
            onChange={handleChange}
          />
        </div>
        <button type="submit">Register</button>
      </form>
    </div>
  );
};

export default Register;
