import React from 'react';

const Profile: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Profile
      </h1>
      <div className="card">
        <p className="text-gray-600">
          This page will show user profile information and settings.
        </p>
      </div>
    </div>
  );
};

export default Profile;
