import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { DEFAULT_PROFILE_PIC } from '../../constants';

export interface LabelTeamMember {
  _id?: string;
  userId?: {
    _id?: string;
    uuid?: string;
    username?: string;
    profilePic?: string;
  } | string;
  username?: string;
  profilePic?: string;
  email?: string;
  role: 'owner' | 'admin' | 'member' | string;
  membershipStatus?: 'active' | 'invited';
  joinedAt?: string;
  addedBy?: {
    _id?: string;
    uuid?: string;
    username?: string;
  };
}

interface LabelTeamTableProps {
  members: LabelTeamMember[];
  isEditable?: boolean;
  currentUserId?: string;
  currentUserRole?: 'owner' | 'admin' | 'member' | string;
  onRemove?: (memberId: string, memberRole: string) => void;
  onCancelInvite?: (memberId: string) => void;
  onChangeRole?: (memberId: string, newRole: string) => void | Promise<void>;
  isRemoving?: boolean;
  context?: 'label' | 'collective';
  canManageRoles?: boolean;
}

const COLLECTIVE_ROLE_OPTIONS = [
  { value: 'founder', label: 'Founder' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
] as const;

interface CollectiveRoleSelectProps {
  username: string;
  role: string;
  allowFounder: boolean;
  disabled?: boolean;
  onChange: (role: string) => void | Promise<void>;
}

const CollectiveRoleSelect: React.FC<CollectiveRoleSelectProps> = ({
  username,
  role,
  allowFounder,
  disabled,
  onChange,
}) => {
  const [value, setValue] = useState(role);

  useEffect(() => {
    setValue(role);
  }, [role]);

  const options = COLLECTIVE_ROLE_OPTIONS.filter(
    (option) => allowFounder || option.value !== 'founder'
  );
  const labelFor = (roleValue: string) =>
    COLLECTIVE_ROLE_OPTIONS.find((option) => option.value === roleValue)?.label || roleValue;

  return (
    <select
      aria-label={`Role for ${username}`}
      title={`Change ${username}'s role`}
      value={options.some((option) => option.value === value) ? value : role}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (next === role) {
          setValue(role);
          return;
        }
        const confirmed = window.confirm(
          `Change ${username}'s role from ${labelFor(role)} to ${labelFor(next)}?`
        );
        if (!confirmed) {
          setValue(role);
          return;
        }
        setValue(next);
        Promise.resolve(onChange(next)).catch(() => {
          setValue(role);
        });
      }}
      className="bg-gray-800 border border-white/15 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

const ROLE_BADGE_MAP: Record<string, { label: string; classes: string }> = {
  owner: { label: 'Owner', classes: 'bg-purple-500/20 text-purple-300 border border-purple-500/60' },
  admin: { label: 'Admin', classes: 'bg-blue-500/20 text-blue-300 border border-blue-500/60' },
  member: { label: 'Member', classes: 'bg-gray-500/20 text-gray-300 border border-gray-500/60' },
  founder: { label: 'Founder', classes: 'bg-orange-500/20 text-orange-300 border border-orange-500/60' },
};

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '—';
  }
};

const getUserData = (member: LabelTeamMember) => {
  if (!member.userId || typeof member.userId === 'string') {
    return {
      id: member.userId || member._id,
      username: member.username || 'Unknown user',
      profilePic: member.profilePic || DEFAULT_PROFILE_PIC,
    };
  }

  return {
    id: member.userId._id || member.userId.uuid || member._id,
    username: member.userId.username || member.username || 'Unknown user',
    profilePic: member.userId.profilePic || member.profilePic || DEFAULT_PROFILE_PIC,
  };
};

const LabelTeamTable: React.FC<LabelTeamTableProps> = ({ 
  members, 
  isEditable = false,
  currentUserId,
  currentUserRole,
  onRemove,
  onCancelInvite,
  onChangeRole,
  isRemoving = false,
  context,
  canManageRoles = false,
}) => {
  if (!members || members.length === 0) {
    return (
      <div className="bg-black/30 border border-white/10 rounded-xl p-6 text-center text-gray-400">
        <Users className="w-6 h-6 mx-auto mb-2 text-gray-500" />
        <p>No team members listed yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
      <table className="min-w-full divide-y divide-white/10">
        <thead className="bg-white/5">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Member
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Role
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Joined
            </th>
            {isEditable && (
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {members.map((member) => {
            const user = getUserData(member);
            const roleMeta = ROLE_BADGE_MAP[member.role] || {
              label: member.role,
              classes: 'bg-gray-500/20 text-gray-300 border border-gray-500/60',
            };
            const memberId = user.id?.toString();
            const isCurrentUser = currentUserId && memberId && currentUserId === memberId.toString();
            const isLabelContext = context === 'label' || (
              context !== 'collective' &&
              (member.role === 'owner' || member.role === 'artist' || member.role === 'producer' || member.role === 'manager' || member.role === 'staff')
            );
            const isCollectiveContext = context === 'collective' || (
              context !== 'label' &&
              (member.role === 'founder' || (member.role === 'admin' && !isLabelContext) || member.role === 'member')
            );
            const isLabelAdmin = member.role === 'admin' || member.role === 'owner';
            const isLabelArtist = isLabelContext && !isLabelAdmin && ['artist', 'producer', 'manager', 'staff', 'member'].includes(member.role);
            const isCollectiveAdmin = isCollectiveContext && (member.role === 'founder' || member.role === 'admin');
            const isCollectiveMember = isCollectiveContext && member.role === 'member';
            const canAssignFounder = Boolean(canManageRoles || currentUserRole === 'founder');
            const founderCount = members.filter((entry) => entry.role === 'founder').length;
            const isOnlyFounder = member.role === 'founder' && founderCount <= 1;

            let canChangeRole = false;
            let canRemove = false;

            if (isCollectiveContext && context === 'collective') {
              const canEditRoster = canAssignFounder || currentUserRole === 'admin';
              canChangeRole = Boolean(
                onChangeRole &&
                canEditRoster &&
                (canAssignFounder || member.role !== 'founder')
              );
              canRemove = Boolean(onRemove && (
                isCurrentUser ||
                (currentUserRole === 'founder' && (isCollectiveAdmin || isCollectiveMember)) ||
                (currentUserRole === 'admin' && isCollectiveMember) ||
                (canManageRoles && !isCurrentUser)
              ));
            } else if (isLabelContext) {
              canChangeRole = Boolean(onChangeRole &&
                currentUserRole === 'owner' &&
                (member.role === 'owner' || member.role === 'admin'));
              canRemove = Boolean(onRemove && (
                isCurrentUser ||
                (currentUserRole === 'owner' && isLabelAdmin) ||
                (currentUserRole === 'admin' && isLabelArtist) ||
                (currentUserRole === 'owner' && isLabelArtist)
              ));
            } else if (isCollectiveContext) {
              canChangeRole = Boolean(onChangeRole &&
                currentUserRole === 'founder' &&
                (member.role === 'founder' || member.role === 'admin' || member.role === 'member'));
              canRemove = Boolean(onRemove && (
                isCurrentUser ||
                (currentUserRole === 'founder' && (isCollectiveAdmin || isCollectiveMember)) ||
                (currentUserRole === 'admin' && isCollectiveMember)
              ));
            }

            const isInvited = member.membershipStatus === 'invited';
            if (isInvited) {
              canChangeRole = false;
              canRemove = false;
            }
            const canCancelInvite = Boolean(
              isInvited &&
              onCancelInvite &&
              context === 'collective' &&
              (canAssignFounder || currentUserRole === 'admin' || canManageRoles)
            );

            const nextCycledRole = () => {
              if (isLabelContext) return member.role === 'owner' ? 'admin' : 'owner';
              if (member.role === 'founder') return 'admin';
              if (member.role === 'admin') return 'member';
              return 'founder';
            };

            return (
              <tr key={user.id} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.profilePic || DEFAULT_PROFILE_PIC}
                      alt={user.username || 'Team member'}
                      className="h-10 w-10 rounded-full object-cover border border-white/10"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_PIC;
                      }}
                    />
                    <div>
                      <div className="text-sm font-medium text-white">{user.username}</div>
                      {member.email && <div className="text-xs text-gray-400">{member.email}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span
                      title={context === 'collective' && isOnlyFounder ? 'A collective needs at least one founder' : undefined}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${roleMeta.classes}`}
                    >
                      {roleMeta.label}
                    </span>
                    {isInvited && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/50">
                        Invited
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-300" title={isInvited ? 'Invitation sent' : undefined}>
                  {formatDate(member.joinedAt)}
                </td>
                {isEditable && (
                  <td className="px-4 py-4 text-right text-sm">
                    {(canChangeRole || canRemove || canCancelInvite) && (
                      <div className="flex items-center justify-end gap-2">
                        {canCancelInvite && (
                          <button
                            onClick={() => {
                              if (onCancelInvite && memberId) onCancelInvite(memberId);
                            }}
                            className="text-xs text-amber-200 hover:text-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isRemoving}
                          >
                            Cancel invite
                          </button>
                        )}
                        {context === 'collective' && canChangeRole && memberId && !isOnlyFounder && (
                          <CollectiveRoleSelect
                            username={user.username || 'this person'}
                            role={member.role}
                            allowFounder={canAssignFounder}
                            disabled={isRemoving}
                            onChange={(nextRole) => onChangeRole!(memberId, nextRole)}
                          />
                        )}
                        {canChangeRole && context !== 'collective' && (
                          <button
                            onClick={() => {
                              if (onChangeRole && memberId) {
                                onChangeRole(memberId, nextCycledRole());
                              }
                            }}
                            className="text-xs text-purple-300 hover:text-purple-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isRemoving}
                          >
                            Change role
                          </button>
                        )}
                        {canRemove && (
                          <button
                            onClick={() => {
                              if (onRemove && memberId) {
                                onRemove(memberId, member.role);
                              }
                            }}
                            className="text-xs text-red-300 hover:text-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isRemoving}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default LabelTeamTable;

