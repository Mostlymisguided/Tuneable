// Login.js
import React, { useState } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode'; // using named import as before
import { useNavigate } from 'react-router-dom';

const Login = ({ setUserId }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/login`,
        formData
      );
      const { token } = response.data;

      // Save the token in localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('token', token);
      }

      // Decode token and extract userId
      const decoded = token ? jwtDecode(token) : null;
      const userId = decoded ? decoded.userId : null;
      console.log('Login token:', token);
      console.log('Login userId:', userId);

      // Also store userId in localStorage (optional, for legacy or backup)
      if (userId) localStorage.setItem('userId', userId);

      // Update global userId state in App
      setUserId(userId);

      // Set default auth header for axios
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      alert('Login successful!');
      navigate('/tunefeed');
    } catch (err) {
      console.error('Login error:', err.response?.data || err.message);
      setError(
        err.response?.data?.error ||
          (err.response?.status === 401
            ? 'Invalid email or password.'
            : 'An unexpected error occurred. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Login</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        {/* Email & Password inputs */}
        <div>
          <label>Email:</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} required />
        </div>
        <div>
          <label>Password:</label>
          <input type="password" name="password" value={formData.password} onChange={handleChange} required />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default Login;
