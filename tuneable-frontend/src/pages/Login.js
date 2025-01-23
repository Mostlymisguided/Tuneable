import React, { useState } from 'react';
import axios from 'axios';

const Login = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

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

            // Redirect to the intended path or default to dashboard
            const redirectPath = localStorage.getItem('redirectPath') || '/';
            localStorage.removeItem('redirectPath'); // Clear redirectPath after use
            window.location.href = redirectPath;
        } catch (err) {
            console.error('Login error:', err.response?.data || err.message);

            // Set user-friendly error messages
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
