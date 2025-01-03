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

        setLoading(true);
        setError(null);

        try {
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties`,
                { name: partyName },
                {
                    headers: { Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}` },
                }
            );

            const { party } = response.data; // Extract party object
            const partyId = party._id; // Get partyId
            localStorage.setItem('partyId', partyId); // Store partyId in local storage
            alert(`Party "${partyName}" created successfully!`);
            window.location.href = `/party/${partyId}`; // Redirect to the party page
        } catch (err) {
            console.error('Error creating party:', err);
            setError(err.response?.data?.error || 'Failed to create party. Please try again.');
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
