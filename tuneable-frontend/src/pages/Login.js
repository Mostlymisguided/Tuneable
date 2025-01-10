import React, { useState } from 'react';
import axios from 'axios';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false); // Add loading state

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true); // Show loading state
    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/users/login`, formData);

      console.log('Login successful:', response.data);
      const { token } = response.data;

      // Save token in localStorage
      localStorage.setItem('authToken', token); // Use a consistent key ('token')

      // Set the default authorization header for Axios
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      alert('Login successful!'); // Notify the user
      window.location.href = '/'; // Redirect to home page or dashboard
    } catch (err) {
      console.error('Login error:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false); // Hide loading state
    }
  };

  return (
    <div>
      <h1>Login</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
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
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default Login;
