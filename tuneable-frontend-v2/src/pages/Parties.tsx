import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { partyAPI } from '../lib/api';
import { Music, Users, MapPin, Clock } from 'lucide-react';

// Define types directly to avoid import issues
interface PartyType {
  _id: string;
  name: string;
  venue?: string;
  location: string;
  host: string;
  partyCode: string;
  attendees: string[];
  songs: any[];
  startTime: string;
  endTime?: string;
  type: 'public' | 'private' | 'geocoded';
  status: 'scheduled' | 'active' | 'ended' | 'canceled';
  watershed: boolean;
  createdAt: string;
  updatedAt: string;
}

const Parties: React.FC = () => {
  const [parties, setParties] = useState<PartyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchParties = async () => {
      try {
        const response = await partyAPI.getParties();
        setParties(response.parties);
      } catch (error) {
        console.error('Error fetching parties:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchParties();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'ended':
        return 'bg-gray-100 text-gray-800';
      case 'canceled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Parties</h1>
          <p className="text-gray-600 mt-2">Discover and join music parties</p>
        </div>
        <Link
          to="/create-party"
          className="btn-primary flex items-center space-x-2"
        >
          <Music className="h-4 w-4" />
          <span>Create Party</span>
        </Link>
      </div>

      {parties.length === 0 ? (
        <div className="text-center py-12">
          <Music className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No parties found</h3>
          <p className="text-gray-600 mb-6">Be the first to create a party!</p>
          <Link to="/create-party" className="btn-primary">
            Create Your First Party
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {parties.map((party) => (
            <div key={party._id} className="card hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{party.name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(party.status)}`}>
                  {party.status}
                </span>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>{party.location}</span>
                </div>
                
                {party.venue && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Music className="h-4 w-4 mr-2" />
                    <span>{party.venue}</span>
                  </div>
                )}

                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>{formatDate(party.startTime)}</span>
                </div>

                <div className="flex items-center text-sm text-gray-600">
                  <Users className="h-4 w-4 mr-2" />
                  <span>{party.attendees.length} attendees</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  Host: {party.host.username}
                </div>
                <Link
                  to={`/party/${party._id}`}
                  className="btn-primary text-sm"
                >
                  Join Party
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Parties;
