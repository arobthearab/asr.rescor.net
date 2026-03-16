import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { fetchAuthEvents, fetchActiveUserCount } from '../lib/apiClient';
import type { AuthEvent } from '../lib/types';

// ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const compactCell = { py: 0.5, px: 1, fontSize: '0.8125rem' } as const;
const compactHeadCell = { ...compactCell, fontWeight: 700 } as const;

const ACTION_OPTIONS = ['all', 'login', 'login_failed', 'token_refresh', 'logout'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UserActivityLogDialog({ open, onClose }: Props) {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(-1);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async (pageNumber: number) => {
    setLoading(true);
    try {
      const limit = PAGE_SIZE;
      const offset = pageNumber * PAGE_SIZE;
      const rows = await fetchAuthEvents({ limit: limit + 1, offset });
      if (rows.length > limit) {
        rows.pop();
        setTotal(-1);
      } else {
        setTotal(offset + rows.length);
      }
      setEvents(rows);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setPage(0);
    setFilterAction('all');
    loadEvents(0);
    fetchActiveUserCount()
      .then(setActiveCount)
      .catch(() => setActiveCount(null));
  }, [open, loadEvents]);

  function handlePageChange(_: unknown, newPage: number): void {
    setPage(newPage);
    loadEvents(newPage);
  }

  const filteredEvents = filterAction === 'all'
    ? events
    : events.filter((event) => event.action === filterAction);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        User Activity Log
        {activeCount !== null && (
          <Chip
            label={`${activeCount} active user${activeCount !== 1 ? 's' : ''} (30 days)`}
            color="info"
            size="small"
          />
        )}
        <Box sx={{ flexGrow: 1 }} />
        <TextField
          select
          size="small"
          label="Action"
          value={filterAction}
          onChange={(event) => setFilterAction(event.target.value)}
          sx={{ minWidth: 140 }}
        >
          {ACTION_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {option === 'all' ? 'All' : option.replace('_', ' ')}
            </MenuItem>
          ))}
        </TextField>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pb: 1 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={compactHeadCell}>Timestamp</TableCell>
                <TableCell sx={compactHeadCell}>User</TableCell>
                <TableCell sx={compactHeadCell}>Action</TableCell>
                <TableCell sx={compactHeadCell}>Outcome</TableCell>
                <TableCell sx={compactHeadCell}>IP Address</TableCell>
                <TableCell sx={compactHeadCell}>Host</TableCell>
                <TableCell sx={compactHeadCell}>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEvents.map((event) => (
                <TableRow key={event.eventId}>
                  <TableCell sx={compactCell}>
                    {new Date(event.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell sx={compactCell}>
                    {event.email || event.username || event.sub || '—'}
                  </TableCell>
                  <TableCell sx={compactCell}>{event.action.replace('_', ' ')}</TableCell>
                  <TableCell sx={compactCell}>
                    <Chip
                      label={event.outcome}
                      size="small"
                      color={event.outcome === 'success' ? 'success' : 'error'}
                      variant="filled"
                    />
                  </TableCell>
                  <TableCell sx={compactCell}>{event.ipAddress}</TableCell>
                  <TableCell sx={compactCell}>{event.host}</TableCell>
                  <TableCell sx={compactCell}>{event.reason || '—'}</TableCell>
                </TableRow>
              ))}
              {filteredEvents.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography color="text.secondary" sx={{ py: 3, fontSize: '0.875rem' }}>
                      No auth events found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </DialogContent>
    </Dialog>
  );
}
