import React, { useState, useEffect } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useSearchParams, useNavigate } from 'react-router-dom';
import API from "../api";

const cardElementOptions = {
    style: {
        base: {
            fontSize: "16px",
            color: "#32325d",
            "::placeholder": { color: "#aab7c4" },
        },
        invalid: { color: "#fa755a" },
    },
    hidePostalCode: false, // Ensure postal code is visible if needed
};

const PaymentForm = () => {
    const stripe = useStripe();
    const elements = useElements();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const clientSecret = searchParams.get('clientSecret');
    const amount = searchParams.get('amount');

    useEffect(() => {
        if (!clientSecret) {
            navigate('/profile');
        }
    }, [clientSecret, navigate]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(false);

        if (!stripe || !elements || !clientSecret) {
            setError("Payment system not initialized.");
            console.error("🚨 Stripe is not initialized.");
            setLoading(false);
            return;
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
            setError("Card details not entered.");
            setLoading(false);
            return;
        }

        // Validate Card Input Before Submitting
        const { error: validationError } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
        });

        if (validationError) {
            setError(validationError.message);
            setLoading(false);
            return;
        }

        console.log("🔑 Client Secret:", clientSecret);
        console.log("💳 Attempting Payment...");
        

        // Confirm the payment
        const result = await stripe.confirmCardPayment(clientSecret, {
            payment_method: { card: cardElement },
        });

        console.log("💳 Stripe Payment Result:", result);

        if (result.error) {
            setError(result.error.message);
        } else if (result.paymentIntent.status === 'succeeded') {
            setSuccess(true);
            try {
                const token = localStorage.getItem('token');
                await API.post("/api/payments/confirm-payment", 
                    { amount: parseFloat(amount) },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                navigate('/profile'); // Redirect back to profile
            } catch (err) {
                console.error("❌ Error updating balance:", err);
                alert("Failed to update balance.");
            }
        }

        setLoading(false);
    };

    return (
        <div>
            <h2>Top Up Your Wallet</h2>
            <form onSubmit={handleSubmit}>
                <CardElement options={cardElementOptions} />
                <button type="submit" disabled={loading}>{loading ? 'Processing...' : `Pay £${amount}`}</button>
            </form>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            {success && <p style={{ color: 'green' }}>Payment successful! Redirecting...</p>}
        </div>
    );
};

export default PaymentForm;
