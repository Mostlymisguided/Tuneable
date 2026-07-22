import React, { useState, useEffect } from 'react';
import { X, Music, Tag, AlertCircle, Loader2, MapPin, Minus, Plus, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { isLocationMatch, formatLocation, formatLocationFilter } from '../utils/locationHelpers';
import { partyAPI } from '../lib/api';
import type { Party } from '../types';
import type { User } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentLocation } from '../contexts/CurrentLocationContext';
import {
  isKnownElement,
  normalizeTipChipForDisplay,
} from '../utils/elementNormalizer';
import TipStatChips from './TipStatChips';

type ProgressStep = 'placing' | 'processing' | 'updating' | null;

interface BidConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tags: string[], amount: number, setProgress?: (step: ProgressStep) => void) => void;
  bidAmount: number;
  mediaTitle: string;
  mediaArtist?: string;
  userBalance?: number;
  isLoading?: boolean;
  party?: Party;
  user?: User | null;
  isNonPlayable?: boolean;
  /** Minimum allowed tip (pounds). Defaults to 0.01. */
  minTip?: number;
  /** Average tip on this media (pounds). Shown as a shortcut chip when provided. */
  avgTip?: number;
  /** #1 tipper aggregate on this media (pounds). Enables the Champion shortcut. */
  championAggregate?: number;
  /** Current user's aggregate on this media (pounds). Used to compute gap to #1. */
  viewerAggregate?: number;
  /** True when the current user already holds #1. */
  viewerIsChampion?: boolean;
  /** Tags pre-selected when the modal opens (e.g. the tag page the tip came from). */
  initialTags?: string[];
}

const BidConfirmationModal: React.FC<BidConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  bidAmount,
  mediaTitle,
  mediaArtist,
  userBalance = 0,
  isLoading = false,
  party,
  user,
  isNonPlayable = false,
  minTip = 0.01,
  avgTip,
  championAggregate,
  viewerAggregate = 0,
  viewerIsChampion = false,
  initialTags,
}) => {
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [amountInput, setAmountInput] = useState('');
  const [userLocationParty, setUserLocationParty] = useState<{ id?: string; _id?: string } | null>(null);
  const [progressStep, setProgressStep] = useState<ProgressStep>(null);
  const [isEnablingCurrentLocation, setIsEnablingCurrentLocation] = useState(false);
  const { user: authUser } = useAuth();
  // Prefer explicit prop (party tips); fall back to auth so chart influence shows everywhere
  const effectiveUser = user ?? authUser;
  const {
    currentLocation,
    status: currentLocationStatus,
    enableCurrentLocation,
  } = useCurrentLocation();

  const homeLocation = effectiveUser?.homeLocation || null;
  const homeLabel = homeLocation ? formatLocation(homeLocation) : null;
  const currentLabel = currentLocation ? formatLocation(currentLocation) : null;
  const samePlace =
    !!(homeLocation?.placeId && currentLocation?.placeId && homeLocation.placeId === currentLocation.placeId);
  const canOfferCurrentLocation =
    currentLocationStatus !== 'denied' && currentLocationStatus !== 'unavailable';

  const handleEnableCurrentLocation = async () => {
    setIsEnablingCurrentLocation(true);
    try {
      const location = await enableCurrentLocation();
      if (location) {
        toast.success(`Current location: ${formatLocation(location)}`);
        return;
      }
      const { getCurrentLocationStatus } = await import('../utils/currentLocationCache');
      if (getCurrentLocationStatus() === 'denied') {
        toast.error('Location permission denied. You can enable it in browser settings.');
      } else {
        toast.error('Could not detect your current location');
      }
    } finally {
      setIsEnablingCurrentLocation(false);
    }
  };
  
  // Check if location mismatch and fetch user's location party
  const isLocationMismatch = party?.type === 'location' && 
    party?.locationFilter && 
    party.locationFilter.countryCode &&
    effectiveUser?.homeLocation && 
    !isLocationMatch(party.locationFilter as { city?: string; countryCode: string }, effectiveUser.homeLocation);
  
  useEffect(() => {
    if (isLocationMismatch && effectiveUser?.homeLocation?.countryCode) {
      // Fetch user's location party
      partyAPI.findLocationParty(
        effectiveUser.homeLocation.countryCode,
        effectiveUser.homeLocation.city
      ).then(({ party }) => {
        if (party) {
          setUserLocationParty({ id: party.id, _id: party._id });
        }
      }).catch(() => {
        // Location party doesn't exist yet - that's okay
        setUserLocationParty(null);
      });
    } else {
      setUserLocationParty(null);
    }
  }, [isLocationMismatch, effectiveUser?.homeLocation]);

  // Reset progress step when modal closes
  useEffect(() => {
    if (!isOpen) {
      setProgressStep(null);
    }
  }, [isOpen]);

  // Seed the editable amount from the incoming default whenever the modal opens
  // (or the target media / default changes while open).
  useEffect(() => {
    if (isOpen) {
      setAmountInput(bidAmount.toFixed(2));
    }
  }, [isOpen, bidAmount]);

  // Pre-select chips on open (e.g. tipping from a tag profile page)
  const initialTagsKey = (initialTags || []).join(',');
  useEffect(() => {
    if (isOpen) {
      const seeded = (initialTags || [])
        .map((tag) => normalizeTipChipForDisplay(tag))
        .filter(Boolean)
        .filter((chip, index, arr) =>
          arr.findIndex((c) => c.toLowerCase() === chip.toLowerCase()) === index
        )
        .slice(0, 5);
      setTags(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTagsKey]);

  const parsedAmount = parseFloat(amountInput);
  const effectiveAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const isAmountValid = Number.isFinite(parsedAmount) && parsedAmount >= minTip;

  const adjustAmount = (delta: number) => {
    const current = Number.isFinite(parsedAmount) ? parsedAmount : minTip;
    const next = Math.max(minTip, current + delta);
    setAmountInput(next.toFixed(2));
  };

  const setAmountTo = (value: number) => {
    setAmountInput(Math.max(minTip, value).toFixed(2));
  };

  const handleAddTag = () => {
    const input = tagInput.trim();
    if (!input) return;

    // Split by comma; classify display form client-side (backend re-classifies on save)
    const newTags = input
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .map(tag => normalizeTipChipForDisplay(tag))
      .filter(tag => {
        const tagLower = tag.toLowerCase();
        return !tags.some(existingTag => existingTag.toLowerCase() === tagLower);
      });

    const remainingSlots = 5 - tags.length;
    if (remainingSlots > 0 && newTags.length > 0) {
      const tagsToAdd = newTags.slice(0, remainingSlots);
      setTags([...tags, ...tagsToAdd]);
      setTagInput('');
    } else if (remainingSlots === 0) {
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = () => {
    if (!isAmountValid) return;
    onConfirm(tags, effectiveAmount, setProgressStep);
    setTags([]);
    setTagInput('');
  };

  const handleClose = () => {
    setTags([]);
    setTagInput('');
    setProgressStep(null);
    onClose();
  };

  if (!isOpen) return null;

  const hasInsufficientFunds = effectiveAmount > userBalance;
  const actionLabel = 'Tip';
  const actionLabelLower = 'tip';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Confirm Your {actionLabel}</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            disabled={isLoading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Media Info */}
        <div className="mb-4 p-3 bg-gray-700 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Music className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">
              Tipping on:
            </span>
          </div>
          <p className="text-white font-medium">{mediaTitle}</p>
          {mediaArtist && (
            <p className="text-gray-400 text-sm">by {mediaArtist}</p>
          )}
          {isNonPlayable && (
            <p className="text-amber-300/90 text-xs mt-2">
              This track is not playable yet. Your tip adds support now — playback and download can follow once audio is uploaded.
            </p>
          )}
        </div>

        {/* Tip Amount Entry */}
        <div className="mb-4 p-4 bg-purple-900/30 rounded-lg border border-purple-600">
          <span className="text-sm text-gray-300">Your {actionLabel} Amount</span>

          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => adjustAmount(-0.01)}
              disabled={isLoading || effectiveAmount <= minTip}
              aria-label="Decrease tip"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-black hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>

            <div className="flex items-center">
              <span className="text-2xl font-bold text-purple-400">£</span>
              <input
                type="number"
                step="0.01"
                min={minTip}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={isLoading}
                className="w-24 bg-transparent text-2xl font-bold text-purple-400 text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            <button
              type="button"
              onClick={() => adjustAmount(0.01)}
              disabled={isLoading}
              aria-label="Increase tip"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-black hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Tip stat shortcuts */}
          <TipStatChips
            className="mt-4 flex items-center justify-center flex-wrap gap-2"
            minTip={minTip}
            avgTip={avgTip}
            championAggregate={championAggregate}
            viewerAggregate={viewerAggregate}
            viewerIsChampion={viewerIsChampion}
            disabled={isLoading}
            onSelect={setAmountTo}
          />

          {!isAmountValid && (
            <p className="mt-3 text-xs text-red-400 text-center">
              Minimum {actionLabelLower} is £{minTip.toFixed(2)}
            </p>
          )}
        </div>

        {/* Insufficient Funds Warning */}
        {hasInsufficientFunds && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded-lg flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">Insufficient Funds</p>
              <p className="text-xs text-red-400 mt-1">
                You need £{effectiveAmount.toFixed(2)} but only have £{userBalance.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Chart influence: home + current location */}
        {effectiveUser && (
          <div className="mb-4 p-3 bg-gray-700/80 border border-gray-600 rounded-lg">
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Chart influence</p>

                {samePlace && currentLabel ? (
                  <p className="text-xs text-gray-300 mt-1">
                    Home &amp; current: <span className="text-white">{currentLabel}</span>
                  </p>
                ) : (
                  <div className="mt-1 space-y-1 text-xs text-gray-300">
                    <p>
                      Home:{' '}
                      <span className="text-white">
                        {homeLabel || 'Not set'}
                      </span>
                    </p>
                    <p>
                      Current:{' '}
                      <span className="text-white">
                        {currentLabel ||
                          (currentLocationStatus === 'denied'
                            ? 'Permission denied'
                            : currentLocationStatus === 'unavailable'
                              ? 'Unavailable'
                              : currentLocationStatus === 'loading' || isEnablingCurrentLocation
                                ? 'Detecting…'
                                : 'Not enabled')}
                      </span>
                    </p>
                  </div>
                )}

                {currentLocation && homeLabel && !samePlace && (
                  <p className="text-xs text-gray-400 mt-2">
                    This tip will influence charts in both places.
                  </p>
                )}

                {currentLocation && !homeLabel && (
                  <p className="text-xs text-gray-400 mt-2">
                    This tip will influence charts where you are now.
                  </p>
                )}

                {!currentLocation && canOfferCurrentLocation && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-gray-400">
                      Enable location to also influence charts where you are.
                    </p>
                    <button
                      type="button"
                      onClick={handleEnableCurrentLocation}
                      disabled={isLoading || isEnablingCurrentLocation || currentLocationStatus === 'loading'}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md transition-colors shrink-0"
                    >
                      {isEnablingCurrentLocation || currentLocationStatus === 'loading' ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Detecting…
                        </>
                      ) : (
                        <>
                          <Navigation className="h-3.5 w-3.5" />
                          Enable
                        </>
                      )}
                    </button>
                  </div>
                )}

                {!currentLocation && currentLocationStatus === 'denied' && (
                  <p className="text-xs text-amber-300/90 mt-2">
                    Location blocked in browser settings — tip will use home only.
                  </p>
                )}

                {!homeLabel && !currentLocation && (
                  <p className="text-xs text-gray-400 mt-2">
                    Add a home location on your profile so tips count on local charts.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Location Mismatch Info */}
        {isLocationMismatch && party?.locationFilter && effectiveUser?.homeLocation && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg flex items-start space-x-2">
            <MapPin className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-300">Your {actionLabel} Location</p>
              <p className="text-xs text-blue-400 mt-1">
                Your {actionLabelLower} will appear in the <strong>{formatLocation(effectiveUser.homeLocation)}</strong> party, 
                not this {formatLocationFilter(party.locationFilter)} party. 
                This helps support artists in your local community!
              </p>
              {userLocationParty && (
                <Link
                  to={`/party/${(userLocationParty as any)?.id || (userLocationParty as any)?._id || ''}`}
                  onClick={() => onClose()}
                  className="inline-block text-xs text-blue-300 underline mt-1 hover:text-blue-200 transition-colors"
                >
                  View {formatLocation(effectiveUser.homeLocation)} Party →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Tip chips: discovery tags + musical elements (classified on save) */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Tag className="h-4 w-4 text-purple-400" />
            <label className="text-sm font-medium text-gray-300">
              Add Tags & Elements (Optional)
            </label>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Genre, mood, setting — or instruments like guitar, 808s, vocals
          </p>
          
          <div className="flex space-x-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., chill, guitar, workout"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              maxLength={32}
              disabled={isLoading}
            />
            <button
              onClick={handleAddTag}
              disabled={!tagInput.trim() || tags.length >= 5 || isLoading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Press Enter to add • Max 5 • {tags.length}/5 used
          </p>

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag, index) => {
                const asElement = isKnownElement(tag);
                return (
                  <span
                    key={index}
                    className={`px-3 py-1 text-white text-sm rounded-full flex items-center gap-2 ${
                      asElement ? 'bg-teal-600' : 'bg-purple-600'
                    }`}
                    title={asElement ? 'Musical element' : 'Discovery tag'}
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className={`ml-1 ${
                        asElement
                          ? 'text-teal-200 hover:text-white'
                          : 'text-purple-200 hover:text-white'
                      }`}
                      type="button"
                      disabled={isLoading}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            disabled={isLoading || hasInsufficientFunds || !isAmountValid}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {progressStep === 'placing' && `Placing ${actionLabelLower}...`}
                  {progressStep === 'processing' && 'Processing transaction...'}
                  {progressStep === 'updating' && 'Updating party...'}
                  {!progressStep && 'Processing...'}
                </span>
              </>
            ) : (
              `Confirm ${actionLabel}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BidConfirmationModal;


