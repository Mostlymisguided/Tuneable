import React from 'react';
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
  onChangeRole?: (memberId: string, newRole: string) => void;
  isRemoving?: boolean;
}

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
  onChangeRole,
  isRemoving = false
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
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${roleMeta.classes}`}>
                    {roleMeta.label}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-gray-300">{formatDate(member.joinedAt)}</td>
                {isEditable && (
                  <td className="px-4 py-4 text-right text-sm">
                    {(() => {
                      const user = getUserData(member);
                      const memberId = user.id?.toString();
                      const isCurrentUser = currentUserId && memberId && currentUserId === memberId.toString();
                      
                      // Determine if this is a label or collective based on roles
                      const isLabelContext = member.role === 'owner' || member.role === 'artist' || member.role === 'producer' || member.role === 'manager' || member.role === 'staff';
                      const isCollectiveContext = member.role === 'founder' || (member.role === 'admin' && !isLabelContext) || member.role === 'member';
                      
                      // For labels
                      const isLabelAdmin = member.role === 'admin' || member.role === 'owner';
                      const isLabelArtist = isLabelContext && !isLabelAdmin && ['artist', 'producer', 'manager', 'staff', 'member'].includes(member.role);
                      
                      // For collectives
                      const isCollectiveAdmin = isCollectiveContext && (member.role === 'founder' || member.role === 'admin');
                      const isCollectiveMember = isCollectiveContext && member.role === 'member';
                      
                      // Determine what actions are allowed
                      let canChangeRole = false;
                      let canRemove = false;
                      
                      if (isLabelContext) {
                        // Label logic: owner can change admin roles, owner can remove admins, admin/owner can remove artists
                        canChangeRole = onChangeRole && 
                          currentUserRole === 'owner' && 
                          (member.role === 'owner' || member.role === 'admin');
                        
                        canRemove = onRemove && (
                          isCurrentUser || // Always allow self-removal
                          (currentUserRole === 'owner' && isLabelAdmin) || // Owner can remove admins
                          (currentUserRole === 'admin' && isLabelArtist) || // Admin can remove artists
                          (currentUserRole === 'owner' && isLabelArtist) // Owner can remove artists
                        );
                      } else if (isCollectiveContext) {
                        // Collective logic: founder can change roles, founder/admin can remove others
                        canChangeRole = onChangeRole && 
                          currentUserRole === 'founder' && 
                          (member.role === 'founder' || member.role === 'admin' || member.role === 'member');
                        
                        canRemove = onRemove && (
                          isCurrentUser || // Always allow self-removal
                          (currentUserRole === 'founder' && (isCollectiveAdmin || isCollectiveMember)) || // Founder can remove anyone
                          (currentUserRole === 'admin' && isCollectiveMember) // Admin can remove members
                        );
                      }

                      if (!canChangeRole && !canRemove) {
                        return null;
                      }

                      // Determine new role for change role button
                      const getNewRole = () => {
                        if (isLabelContext) {
                          return member.role === 'owner' ? 'admin' : 'owner';
                        } else if (isCollectiveContext) {
                          // Cycle through: founder -> admin -> member -> founder
                          if (member.role === 'founder') return 'admin';
                          if (member.role === 'admin') return 'member';
                          return 'founder';
                        }
                        return member.role;
                      };

                      return (
                        <div className="flex items-center justify-end gap-2">
                          {canChangeRole && (
                            <button
                              onClick={() => {
                                if (onChangeRole && memberId) {
                                  onChangeRole(memberId, getNewRole());
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
                      );
                    })()}
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

