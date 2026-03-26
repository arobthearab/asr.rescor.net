import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import {
  fetchUsers,
  provisionUser,
  updateUserRoles,
  type AdminUser,
} from '../lib/apiClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import UserMenu from '../components/UserMenu';
import UserActivityLogDialog from '../components/UserActivityLogDialog';

// ────────────────────────────────────────────────────────────────────

const VALID_ROLES = ['admin', 'reviewer', 'user', 'auditor'] as const;
const compactCell = { py: 0.5, px: 1.5, fontSize: '0.8125rem' } as const;
const compactHeadCell = { ...compactCell, fontWeight: 700 } as const;

// ────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { isAdmin } = useCurrentUser();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // Provision dialog
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionEmail, setProvisionEmail] = useState('');
  const [provisionRoles, setProvisionRoles] = useState<string[]>(['user']);

  // Edit roles dialog
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);

  // Activity log dialog
  const [activityLogOpen, setActivityLogOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers()
      .then(setUsers)
      .catch((error) => setToast({ message: error.message, severity: 'error' }));
  }, [isAdmin]);

  // ── Provision ────────────────────────────────────────────────────

  function openProvision(): void {
    setProvisionEmail('');
    setProvisionRoles(['user']);
    setProvisionOpen(true);
  }

  async function handleProvision(): Promise<void> {
    try {
      const created = await provisionUser(provisionEmail.trim(), provisionRoles);
      setUsers((previous) => [...previous, created]);
      setProvisionOpen(false);
      setToast({ message: `Provisioned ${created.email}`, severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    }
  }

  // ── Edit roles ──────────────────────────────────────────────────

  function openEditRoles(user: AdminUser): void {
    setEditUser(user);
    setEditRoles([...user.roles]);
  }

  async function handleUpdateRoles(): Promise<void> {
    if (!editUser) return;
    try {
      const updated = await updateUserRoles(editUser.sub, editRoles);
      setUsers((previous) => previous.map((u) => (u.sub === updated.sub ? updated : u)));
      setEditUser(null);
      setToast({ message: `Updated roles for ${updated.email || updated.username}`, severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    }
  }

  // ── Role toggle helper ─────────────────────────────────────────

  function toggleRole(
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    role: string,
  ): void {
    setter(
      current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role],
    );
  }

  // ── Guard ───────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography color="error">Admin access required.</Typography>
      </Container>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" edge="start" aria-label="Back to dashboard" onClick={() => navigate('/')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            User Management
          </Typography>
          <IconButton color="inherit" onClick={() => setActivityLogOpen(true)} title="User Activity Log">
            <HistoryIcon />
          </IconButton>
          <Button color="inherit" startIcon={<PersonAddIcon />} onClick={openProvision}>
            Provision User
          </Button>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 3 }}>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={compactHeadCell}>Email / Username</TableCell>
                <TableCell sx={compactHeadCell}>Display Name</TableCell>
                <TableCell sx={compactHeadCell}>Roles</TableCell>
                <TableCell sx={compactHeadCell}>First Seen</TableCell>
                <TableCell sx={compactHeadCell}>Last Seen</TableCell>
                <TableCell sx={compactHeadCell} />
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.sub} sx={{ '& td': compactCell }}>
                  <TableCell>{user.email || user.username || user.sub}</TableCell>
                  <TableCell>{user.displayName || '—'}</TableCell>
                  <TableCell>
                    {user.roles.map((role) => (
                      <Chip key={role} label={role} size="small" sx={{ mr: 0.5 }} />
                    ))}
                  </TableCell>
                  <TableCell>
                    {user.firstSeen ? new Date(user.firstSeen).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    {user.lastSeen ? new Date(user.lastSeen).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => openEditRoles(user)} title="Edit roles">
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 3, fontSize: '0.875rem' }}>
                      No users found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>

      {/* ── Provision Dialog ─────────────────────────────────────── */}
      <Dialog open={provisionOpen} onClose={() => setProvisionOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Provision User</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Email address"
            type="email"
            value={provisionEmail}
            onChange={(event) => setProvisionEmail(event.target.value)}
          />
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Roles</Typography>
          {VALID_ROLES.map((role) => (
            <FormControlLabel
              key={role}
              control={
                <Checkbox
                  checked={provisionRoles.includes(role)}
                  onChange={() => toggleRole(provisionRoles, setProvisionRoles, role)}
                  size="small"
                />
              }
              label={role}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProvisionOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleProvision}
            disabled={!provisionEmail.trim() || provisionRoles.length === 0}
          >
            Provision
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Roles Dialog ────────────────────────────────────── */}
      <Dialog open={editUser !== null} onClose={() => setEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Roles — {editUser?.email || editUser?.username}</DialogTitle>
        <DialogContent>
          {VALID_ROLES.map((role) => (
            <FormControlLabel
              key={role}
              control={
                <Checkbox
                  checked={editRoles.includes(role)}
                  onChange={() => toggleRole(editRoles, setEditRoles, role)}
                  size="small"
                />
              }
              label={role}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditUser(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpdateRoles}
            disabled={editRoles.length === 0}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Activity Log Dialog ──────────────────────────────────── */}
      <UserActivityLogDialog open={activityLogOpen} onClose={() => setActivityLogOpen(false)} />
      {/* ── Toast ────────────────────────────────────────────────── */}
      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
