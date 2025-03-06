import React, { useState } from 'react';
import axios from 'axios';

const CreateParty = () => {
    const [partyName, setPartyName] = useState('');
    const [partyVenue, setPartyVenue] = useState('');
    const [partyLocation, setPartyLocation] = useState('');
    const [partyStart, setPartyStart] = useState('');
    const [partyEnd, setPartyEnd] = useState('');
    const [partyType, setPartyType] = useState('public');
    const [partyWatershed, setPartyWatershed] = useState('true');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const createParty = async () => {
        if (!partyName.trim()) return setError('Party Name cannot be empty');
        if (!partyVenue.trim()) return setError('Party Venue cannot be empty');
        if (!partyLocation.trim()) return setError('Party Location cannot be empty');
        if (!partyStart) return setError('Party Start Date and Time are required');
        if (!partyEnd) return setError('Party End Date and Time are required');

        // ✅ Ensure End Time is after Start Time
        if (new Date(partyEnd) <= new Date(partyStart)) {
            return setError('Party End Time must be after Start Time');
        }

        const token = localStorage.getItem('token');
        if (!token) {
            alert('You must be logged in to create a party.');
            window.location.href = '/login';
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // ✅ Convert `datetime-local` format to ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`)
            const formattedStart = new Date(partyStart).toISOString();
            const formattedEnd = new Date(partyEnd).toISOString();

            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties`,
                {
                    name: partyName,
                    venue: partyVenue,
                    location: partyLocation,
                    startTime: formattedStart,
                    endTime: formattedEnd,
                    type: partyType,
                    watershed: partyWatershed,
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            const { party } = response.data;
            localStorage.setItem('partyId', party._id);

            alert(`Party "${party.name}" created successfully! Party Code: ${party.partyCode}`);
            window.location.href = `/party/${party._id}`;
        } catch (err) {
            console.error('Error creating party:', err);
            setError(err.response?.data?.error || 'Failed to create party. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1>New Party</h1>

            <input type="text" placeholder="Enter Party Name" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
            <p></p>

            <input type="text" placeholder="Enter or Select Venue" value={partyVenue} list="venueOptions" onChange={(e) => setPartyVenue(e.target.value)} />
            <datalist id="venueOptions">
                <option value="Home" />
                <option value="Club" />
                <option value="Bar" />
                <option value="Outdoor" />
                <option value="Boat" />
            </datalist>
            <p></p>

            <input type="text" placeholder="Enter Party Location" value={partyLocation} onChange={(e) => setPartyLocation(e.target.value)} />
            <p></p>

            {/* ✅ Use `datetime-local` for accurate user input */}
            <label>Party Start</label>
            <input type="datetime-local" value={partyStart} onChange={(e) => setPartyStart(e.target.value)} />
            <p></p>

            <label>Party End</label>
            <input type="datetime-local" value={partyEnd} onChange={(e) => setPartyEnd(e.target.value)} />
            <p></p>

            <select value={partyType} onChange={(e) => setPartyType(e.target.value)}>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="geocoded">Geocoded</option>
            </select>
            <p>Party Type</p>

            <label>
            <input 
            type="checkbox"
            checked={partyWatershed}
            onChange={(e) => setPartyWatershed(e.target.checked)}
            />
            Use Real Money?
            </label>
            <p></p>
            <button onClick={createParty} disabled={loading}>
                {loading ? 'Creating...' : 'Create Party'}
            </button>

            {loading && <p style={{ color: 'blue' }}>Creating your party...</p>}
            {error && <p style={{ color: 'red', fontWeight: 'bold' }}>{error}</p>}
        </div>
    );
};

export default CreateParty;
