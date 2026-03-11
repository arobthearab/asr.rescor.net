import { createTheme } from '@mui/material/styles';

export const brandColors = {
  green: '#2E7D32',
  blue: '#1565C0',
  gray: '#757575',
  gapRed: '#C62828',
  ratingLow: '#2E7D32',
  ratingModerate: '#F9A825',
  ratingElevated: '#EF6C00',
  ratingCritical: '#C62828',
} as const;

export const theme = createTheme({
  palette: {
    primary: { main: brandColors.blue },
    secondary: { main: brandColors.green },
    error: { main: brandColors.gapRed },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});
