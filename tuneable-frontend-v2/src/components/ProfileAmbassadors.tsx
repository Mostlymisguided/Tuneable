import React from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_PROFILE_PIC } from '../constants';

export type ProfileAmbassador = {
  username: string;
  uuid?: string;
  profilePic?: string | null;
  artistName?: string | null;
  label?: string | null;
  tag?: string | null;
  placeLabel?: string | null;
};

const ProfileAmbassadors: React.FC<{
  ambassadors: ProfileAmbassador[];
  heading?: string;
}> = ({ ambassadors, heading = 'Ambassadors' }) => {
  if (!ambassadors.length) return null;
  return (
    <div className="mb-3">
      <p className="text-xs uppercase tracking-wide text-purple-300 font-semibold mb-2 text-center md:text-left">
        {heading}
      </p>
      <div className="flex flex-wrap justify-center md:justify-start gap-2">
        {ambassadors.map((person) => {
          const name = person.artistName || person.username;
          const extra = person.placeLabel && person.tag ? person.placeLabel : '';
          return (
            <Link
              key={`${person.uuid || person.username}-${person.label || ''}`}
              to={person.uuid ? `/user/${person.uuid}` : '#'}
              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/20 border border-white/10 text-sm text-white no-underline hover:border-purple-400/50"
            >
              <img
                src={person.profilePic || DEFAULT_PROFILE_PIC}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
              />
              <span>{name}{extra ? ` · ${extra}` : ''}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default ProfileAmbassadors;
