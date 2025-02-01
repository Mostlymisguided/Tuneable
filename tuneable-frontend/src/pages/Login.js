import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom'; // ✅ Import useNavigate

const Login = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate(); // ✅ React Router navigation hook

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

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

            // Save token in localStorage
            localStorage.setItem('token', token);

            // Optionally set default authorization header for Axios globally
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            alert('Login successful!');

            // Redirect user to TuneFeed after login
            const redirectPath = localStorage.getItem('redirectPath') || '/tunefeed';
            localStorage.removeItem('redirectPath'); // Clear it after use
            navigate(redirectPath);

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
