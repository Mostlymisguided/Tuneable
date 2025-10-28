import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AudioLines, Globe, Coins, Gift } from 'lucide-react';
import TopTunes from '../components/TopTunes';

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl text-center font-bold text-gray-300">
          Welcome back, {user?.username}!
        </h1>
        <p className="text-center text-gray-400 mt-2">
          Ready to create some amazing music experiences?
        </p>
      </div>

      {/* Top Tunes Section */}
      <div className="mb-8">
        <TopTunes limit={5} showHeader={true} />
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="bg-primary-100 p-3 rounded-lg">
              <Coins className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Balance</p>
              <p className="text-2xl font-semibold text-white">
                £{user?.balance?.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-lg">
              <Globe className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Global Rank</p>
              <p className="text-2xl font-semibold text-white">
                #{user?.globalUserAggregateRank || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Gift className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">TuneBytes</p>
              <p className="text-2xl font-semibold text-white">
                {(user as any)?.tuneBytes?.toFixed(0) || '0'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Coins className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Avg Bid</p>
              <p className="text-2xl font-semibold text-white">
                £{user?.globalUserBidAvg?.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <AudioLines className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Total Bids</p>
              <p className="text-2xl font-semibold text-white">
                {user?.globalUserBids || 0}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
