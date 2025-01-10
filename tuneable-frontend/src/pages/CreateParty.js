import React, { useState } from 'react';
import axios from 'axios';

const CreateParty = () => {
    const [partyName, setPartyName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const createParty = async () => {
        if (!partyName.trim()) {
            alert('Party name cannot be empty');
            return;
        }

        if (partyName.trim().length > 50) {
            alert('Party name cannot exceed 50 characters');
            return;
        }

        // Retrieve token from localStorage
        const token = localStorage.getItem('authToken'); // Ensure you're using the correct key
        console.log('AuthToken for party creation:', token); // Debug log

        if (!token) {
            alert('You must be logged in to create a party.');
            window.location.href = '/login'; // Redirect to login page
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties`,
                { name: partyName },
                {
                    headers: { Authorization: `Bearer ${token}` }, // Use the retrieved token
                }
            );

            const { party } = response.data; // Extract party object
            const partyId = party._id; // Get partyId
            const partyCode = party.partyCode; // Get the updated partyCode field

            localStorage.setItem('partyId', partyId); // Store partyId in local storage
            alert(`Party "${partyName}" created successfully! Party Code: ${partyCode}`); // Include partyCode in the alert
            window.location.href = `/party/${partyId}`; // Redirect to the party page
        } catch (err) {
            console.error('Error creating party:', err);

            // Enhanced error handling
            if (err.response?.data?.details?.includes('E11000 duplicate key')) {
                setError('A unique code could not be generated for the party. Please try again.');
            } else {
                setError(err.response?.data?.error || 'Failed to create party. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>Create a New Party</h1>
            <input
                type="text"
                placeholder="Enter party name"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
            />
            <button onClick={createParty} disabled={loading}>
                {loading ? 'Creating...' : 'Create Party'}
            </button>
            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
};

export default CreateParty;
