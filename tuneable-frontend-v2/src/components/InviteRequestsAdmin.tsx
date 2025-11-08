import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Mail, MessageSquare, CheckCircle, XCircle, Clock, Copy } from 'lucide-react';
import { userAPI } from '../lib/api';

interface InviteRequest {
  _id: string;
  email: string;
  name: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  inviteCode?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedReason?: string;
}

interface InviteRequestsAdminProps {
  onPendingCountChange?: (pendingCount: number) => void;
}

const InviteRequestsAdmin: React.FC<InviteRequestsAdminProps> = ({ onPendingCountChange }) => {
  const [requests, setRequests] = useState<InviteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const statusParam = filter === 'all' ? undefined : filter;
      const response = await userAPI.getInviteRequests(statusParam);
      const requestList = response.requests || [];
      setRequests(requestList);
      if (onPendingCountChange) {
        const pendingCount = requestList.filter((request: InviteRequest) => request.status === 'pending').length;
        onPendingCountChange(pendingCount);
      }
    } catch (error: any) {
      console.error('Error loading invite requests:', error);
      toast.error('Failed to load invite requests');
      onPendingCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      setProcessingId(requestId);
      const response = await userAPI.approveInviteRequest(requestId);
      toast.success(`Approved! Invite code: ${response.inviteCode}`);
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to approve request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    
    try {
      setProcessingId(requestId);
      await userAPI.rejectInviteRequest(requestId, reason || undefined);
      toast.success('Request rejected');
      await loadRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Invite code copied!');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-900/40 text-yellow-400 border-yellow-500/30',
      approved: 'bg-green-900/40 text-green-400 border-green-500/30',
      rejected: 'bg-red-900/40 text-red-400 border-red-500/30',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Invite Requests</h2>
        
        {/* Filter Tabs */}
        <div className="flex space-x-2">
          {['all', 'pending', 'approved', 'rejected'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === tab
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full"></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="card bg-black/20 rounded-lg p-12 text-center">
          <Mail className="h-16 w-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No {filter !== 'all' ? filter : ''} requests found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request._id}
              className="card bg-black/20 border border-purple-500/20 rounded-lg p-6 hover:border-purple-500/40 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-4 flex-1">
                  <div className="flex-shrink-0">
                    {getStatusIcon(request.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{request.name}</h3>
                      {getStatusBadge(request.status)}
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center text-gray-300">
                        <Mail className="h-4 w-4 mr-2" />
                        {request.email}
                      </div>
                      
                      <div className="flex items-start text-gray-300">
                        <MessageSquare className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        <p className="break-words">{request.reason}</p>
                      </div>
                      
                      <div className="flex items-center text-gray-400 text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Requested {formatDate(request.createdAt)}
                      </div>

                      {request.status === 'approved' && request.inviteCode && (
                        <div className="flex items-center space-x-2 mt-3 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                          <span className="text-green-400 font-semibold">Invite Code:</span>
                          <span className="text-white font-mono text-lg">{request.inviteCode}</span>
                          <button
                            onClick={() => copyInviteCode(request.inviteCode!)}
                            className="text-green-400 hover:text-green-300"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {request.status === 'rejected' && request.rejectedReason && (
                        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-xs">
                          <strong>Reason:</strong> {request.rejectedReason}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {request.status === 'pending' && (
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleApprove(request._id)}
                      disabled={processingId === request._id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleReject(request._id)}
                      disabled={processingId === request._id}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InviteRequestsAdmin;

