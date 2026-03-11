import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
  Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { brandColors } from '../theme/theme';
import { fetchReviews, createReview } from '../lib/apiClient';

// ────────────────────────────────────────────────────────────────────
// Rating color map
// ────────────────────────────────────────────────────────────────────

const ratingColorMap: Record<string, string> = {
  Low: brandColors.ratingLow,
  Moderate: brandColors.ratingModerate,
  Elevated: brandColors.ratingElevated,
  Critical: brandColors.ratingCritical,
};

// ────────────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────────────

interface ReviewSummary {
  reviewId: string;
  applicationName: string;
  assessor: string;
  status: string;
  rating: string | null;
  rskNormalized: number | null;
  created: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [applicationName, setApplicationName] = useState('');
  const [assessor, setAssessor] = useState('');

  useEffect(() => {
    fetchReviews().then((data) => setReviews(data as ReviewSummary[]));
  }, []);

  async function handleCreate(): Promise<void> {
    if (applicationName.trim() && assessor.trim()) {
      const result = (await createReview(applicationName.trim(), assessor.trim())) as Record<string, unknown>;
      const created = (result.review ?? result) as ReviewSummary;
      setDialogOpen(false);
      setApplicationName('');
      setAssessor('');
      navigate(`/review/${created.reviewId}`);
    }
  }

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Application Security Review
          </Typography>
          <Button
            color="inherit"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            New Review
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Application</strong></TableCell>
                <TableCell><strong>Assessor</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Rating</strong></TableCell>
                <TableCell><strong>Score</strong></TableCell>
                <TableCell><strong>Created</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reviews.map((review) => (
                <TableRow
                  key={review.reviewId}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/review/${review.reviewId}`)}
                >
                  <TableCell>{review.applicationName}</TableCell>
                  <TableCell>{review.assessor}</TableCell>
                  <TableCell>
                    <Chip
                      label={review.status}
                      size="small"
                      color={review.status === 'SUBMITTED' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {review.rating ? (
                      <Chip
                        label={review.rating}
                        size="small"
                        sx={{
                          backgroundColor: ratingColorMap[review.rating] || brandColors.gray,
                          color: '#fff',
                        }}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {review.rskNormalized != null
                      ? `${review.rskNormalized.toFixed(1)}%`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {new Date(review.created).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {reviews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 4 }}>
                      No reviews yet. Click "New Review" to begin.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>

      {/* New Review Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>New Application Security Review</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Application Name"
            value={applicationName}
            onChange={(event) => setApplicationName(event.target.value)}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Assessor"
            value={assessor}
            onChange={(event) => setAssessor(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
