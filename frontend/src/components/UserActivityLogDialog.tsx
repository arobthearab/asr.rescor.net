import { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  fetchAuthEvents,
  fetchActiveUserCount,
  fetchAuthSessions,
  fetchSessionEvents,
} from '../lib/apiClient';
import type { AuthEvent, AuthSession } from '../lib/types';

// ────────────────────────────────────────────────────────────────────

const EVENTS_PAGE_SIZE = 50;
const SESSIONS_PAGE_SIZE = 20;
const compactCell = { py: 0.5, px: 1, fontSize: '0.8125rem' } as const;
const compactHeadCell = { ...compactCell, fontWeight: 700 } as const;

const ACTION_OPTIONS = ['all', 'login', 'login_failed', 'token_refresh', 'logout'] as const;

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(oldestIso: string, newestIso: string): string {
  const milliseconds = new Date(newestIso).getTime() - new Date(oldestIso).getTime();
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function userLabel(row: { email: string | null; username: string | null; sub: string | null }): string {
  return row.email || row.username || row.sub || 'anonymous';
}

// ────────────────────────────────────────────────────────────────────
// EventsTable — flat list of auth events with pagination
// ────────────────────────────────────────────────────────────────────

function EventsTable({ events, loading }: { events: AuthEvent[]; loading: boolean }) {
  return (
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
          {events.map((event) => (
            <TableRow key={event.eventId}>
              <TableCell sx={compactCell}>{formatTimestamp(event.timestamp)}</TableCell>
              <TableCell sx={compactCell}>{userLabel(event)}</TableCell>
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
          {events.length === 0 && !loading && (
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
  );
}

// ────────────────────────────────────────────────────────────────────
// SessionRow — expandable row showing session summary + detail events
// ────────────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: AuthSession }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AuthEvent[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function handleExpand(_: unknown, isExpanded: boolean) {
    setExpanded(isExpanded);
    if (isExpanded && detail === null) {
      setLoadingDetail(true);
      try {
        const events = await fetchSessionEvents({
          sub: session.sub,
          from: session.oldestTimestamp,
          to: session.newestTimestamp,
        });
        setDetail(events);
      } catch {
        setDetail([]);
      } finally {
        setLoadingDetail(false);
      }
    }
  }

  const duration = formatDuration(session.oldestTimestamp, session.newestTimestamp);

  return (
    <Accordion expanded={expanded} onChange={handleExpand} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 180 }}>
            {userLabel(session)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 150 }}>
            {formatTimestamp(session.newestTimestamp)}
          </Typography>
          <Chip label={`${session.eventCount} calls`} size="small" variant="outlined" />
          <Chip label={duration} size="small" variant="outlined" color="default" />
          {session.failureCount > 0 && (
            <Chip label={`${session.failureCount} failed`} size="small" color="error" variant="filled" />
          )}
          <Typography variant="caption" color="text.secondary">
            {session.ipAddresses.join(', ')}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1, pt: 0, pb: 1 }}>
        {loadingDetail ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Loading…
          </Typography>
        ) : (
          <EventsTable events={detail || []} loading={false} />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

// ────────────────────────────────────────────────────────────────────
// UserActivityLogDialog — main dialog with Sessions / Events tabs
// ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UserActivityLogDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState(0); // 0 = Sessions, 1 = Events
  const [activeCount, setActiveCount] = useState<number | null>(null);

  // ── Events tab state ───────────────────────────────────────────
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [eventsPage, setEventsPage] = useState(0);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [loadingEvents, setLoadingEvents] = useState(false);

  // ── Sessions tab state ─────────────────────────────────────────
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionsPage, setSessionsPage] = useState(0);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const loadEvents = useCallback(async (pageNumber: number) => {
    setLoadingEvents(true);
    try {
      const result = await fetchAuthEvents({
        limit: EVENTS_PAGE_SIZE,
        offset: pageNumber * EVENTS_PAGE_SIZE,
      });
      setEvents(result.events);
      setEventsTotal(result.total);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const loadSessions = useCallback(async (pageNumber: number) => {
    setLoadingSessions(true);
    try {
      const result = await fetchAuthSessions({
        limit: SESSIONS_PAGE_SIZE,
        offset: pageNumber * SESSIONS_PAGE_SIZE,
      });
      setSessions(result.sessions);
      setSessionsTotal(result.total);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab(0);
    setEventsPage(0);
    setSessionsPage(0);
    setFilterAction('all');
    loadSessions(0);
    fetchActiveUserCount()
      .then(setActiveCount)
      .catch(() => setActiveCount(null));
  }, [open, loadSessions]);

  function handleTabChange(_: unknown, newValue: number): void {
    setTab(newValue);
    if (newValue === 0 && sessions.length === 0) loadSessions(0);
    if (newValue === 1 && events.length === 0) loadEvents(0);
  }

  function handleEventsPageChange(_: unknown, newPage: number): void {
    setEventsPage(newPage);
    loadEvents(newPage);
  }

  function handleSessionsPageChange(_: unknown, newPage: number): void {
    setSessionsPage(newPage);
    loadSessions(newPage);
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
        {tab === 1 && (
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
        )}
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ px: 2, pb: 1 }}>
        <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 1 }}>
          <Tab label="Sessions" />
          <Tab label="Events" />
        </Tabs>

        {/* ── Sessions tab ──────────────────────────────────────── */}
        {tab === 0 && (
          <>
            {sessions.length === 0 && !loadingSessions && (
              <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center', fontSize: '0.875rem' }}>
                No sessions found.
              </Typography>
            )}
            {sessions.map((session, index) => (
              <SessionRow
                key={`${session.sub}-${session.oldestTimestamp}-${index}`}
                session={session}
              />
            ))}
            <TablePagination
              component="div"
              count={sessionsTotal}
              page={sessionsPage}
              onPageChange={handleSessionsPageChange}
              rowsPerPage={SESSIONS_PAGE_SIZE}
              rowsPerPageOptions={[SESSIONS_PAGE_SIZE]}
            />
          </>
        )}

        {/* ── Events tab ────────────────────────────────────────── */}
        {tab === 1 && (
          <>
            <EventsTable events={filteredEvents} loading={loadingEvents} />
            <TablePagination
              component="div"
              count={eventsTotal}
              page={eventsPage}
              onPageChange={handleEventsPageChange}
              rowsPerPage={EVENTS_PAGE_SIZE}
              rowsPerPageOptions={[EVENTS_PAGE_SIZE]}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
