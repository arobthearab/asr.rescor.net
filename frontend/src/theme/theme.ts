import { createTheme } from '@mui/material/styles';

export const strideColors = {
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
    primary: { main: strideColors.blue },
    secondary: { main: strideColors.green },
    error: { main: strideColors.gapRed },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});
