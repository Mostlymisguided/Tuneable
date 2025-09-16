import React from 'react';

const Payment: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Payment
      </h1>
      <div className="card">
        <p className="text-gray-600">
          This page will contain Stripe payment integration for topping up balance.
        </p>
      </div>
    </div>
  );
};

export default Payment;
