import React, { useState, useEffect } from 'react';
import { reportAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { Flag, ExternalLink, CheckCircle, XCircle, Clock, User as UserIcon, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Report {
  _id: string;
  mediaId: {
    _id: string;
    uuid: string;
    title: string;
    artist: string;
    coverArt?: string;
  };
  reportedBy: {
    _id: string;
    uuid: string;
    username: string;
    email?: string;
    profilePic?: string;
  };
  category: string;
  description: string;
  contactEmail?: string;
  status: string;
  adminNotes?: string;
  createdAt: string;
  resolvedBy?: {
    username: string;
  };
  resolvedAt?: string;
}

const categoryLabels: { [key: string]: string } = {
  copyright: 'Copyright/Rights Issue',
  incorrect_info: 'Incorrect Information',
  incorrect_tags: 'Incorrect Tags',
  inappropriate: 'Inappropriate Content',
  duplicate: 'Duplicate',
  other: 'Other Issue'
};

const statusColors: { [key: string]: string } = {
  pending: 'bg-yellow-600',
  in_review: 'bg-blue-600',
  resolved: 'bg-green-600',
  dismissed: 'bg-gray-600'
};

const ReportsAdmin: React.FC = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingReport, setUpdatingReport] = useState(false);

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await reportAPI.getReports(statusFilter || undefined);
      setReports(data.reports || []);
    } catch (error) {
      console.error('Error loading reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId: string, newStatus: string) => {
    try {
      setUpdatingReport(true);
      await reportAPI.updateReport(reportId, {
        status: newStatus,
        adminNotes: adminNotes || undefined
      });
      toast.success(`Report ${newStatus}`);
      setSelectedReport(null);
      setAdminNotes('');
      loadReports();
    } catch (error) {
      console.error('Error updating report:', error);
      toast.error('Failed to update report');
    } finally {
      setUpdatingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-white">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
          <Flag className="w-6 h-6 text-purple-400" />
          <span>Tune Reports</span>
        </h2>
      </div>

      {/* Status Filter */}
      <div className="flex items-center space-x-2">
        <span className="text-gray-300 text-sm">Filter:</span>
        {['all', 'pending', 'in_review', 'resolved', 'dismissed'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status === 'all' ? '' : status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === (status === 'all' ? '' : status)
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="card text-center py-12">
          <Flag className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No reports found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report._id}
              className="card hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                {/* Report Info */}
                <div className="flex-1 space-y-3">
                  {/* Header */}
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium text-white ${statusColors[report.status]}`}>
                      {report.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      report.category === 'copyright' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'
                    }`}>
                      {categoryLabels[report.category]}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Tune Info */}
                  <div className="flex items-center space-x-3">
                    <Music className="w-5 h-5 text-purple-400" />
                    <div>
                      <button
                        onClick={() => navigate(`/tune/${report.mediaId.uuid}`)}
                        className="text-white font-medium hover:text-purple-300 transition-colors"
                      >
                        {report.mediaId.title}
                      </button>
                      <p className="text-gray-400 text-sm">
                        by {Array.isArray(report.mediaId.artist) ? report.mediaId.artist.map((a: any) => a.name).join(', ') : report.mediaId.artist}
                      </p>
                    </div>
                  </div>

                  {/* Reporter Info */}
                  <div className="flex items-center space-x-3">
                    <UserIcon className="w-5 h-5 text-gray-400" />
                    <div>
                      <button
                        onClick={() => navigate(`/user/${report.reportedBy.uuid}`)}
                        className="text-gray-300 hover:text-white transition-colors"
                      >
                        @{report.reportedBy.username}
                      </button>
                      {report.contactEmail && (
                        <p className="text-gray-500 text-sm">Contact: {report.contactEmail}</p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="bg-gray-800/50 p-3 rounded-lg">
                    <p className="text-gray-300 text-sm">{report.description}</p>
                  </div>

                  {/* Admin Notes */}
                  {report.adminNotes && (
                    <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/30">
                      <p className="text-blue-200 text-sm"><strong>Admin Notes:</strong> {report.adminNotes}</p>
                      {report.resolvedBy && (
                        <p className="text-blue-300 text-xs mt-1">
                          Resolved by {report.resolvedBy.username} on {new Date(report.resolvedAt!).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="ml-4 flex flex-col space-y-2">
                  {report.status === 'pending' && (
                    <>
                      <button
                        onClick={() => setSelectedReport(report)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(report._id, 'dismissed')}
                        disabled={updatingReport}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {report.status === 'in_review' && (
                    <>
                      <button
                        onClick={() => setSelectedReport(report)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(report._id, 'dismissed')}
                        disabled={updatingReport}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => navigate(`/tune/${report.mediaId.uuid}`)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-1"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>View</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl max-w-lg w-full p-6 border border-purple-500/20">
            <h3 className="text-xl font-bold text-white mb-4">Review Report</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-gray-300 text-sm mb-2">Admin Notes (optional)</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {selectedReport.status === 'pending' && (
                <button
                  onClick={() => handleUpdateStatus(selectedReport._id, 'in_review')}
                  disabled={updatingReport}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <Clock className="w-4 h-4" />
                  <span>Mark In Review</span>
                </button>
              )}
              <button
                onClick={() => handleUpdateStatus(selectedReport._id, 'resolved')}
                disabled={updatingReport}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Resolve</span>
              </button>
              <button
                onClick={() => handleUpdateStatus(selectedReport._id, 'dismissed')}
                disabled={updatingReport}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <XCircle className="w-4 h-4" />
                <span>Dismiss</span>
              </button>
              <button
                onClick={() => {
                  setSelectedReport(null);
                  setAdminNotes('');
                }}
                disabled={updatingReport}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsAdmin;

