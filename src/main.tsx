import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import App from "./App.tsx";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./index.css";

const muiTheme = createTheme({
  components: {
    MuiButton: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: { textTransform: "none" },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small", margin: "dense" },
    },
    MuiAutocomplete: {
      styleOverrides: {
        inputRoot: {
          alignItems: "center",
        },
        input: {
          fontSize: "0.8125rem",
          "&::placeholder": {
            fontSize: "0.8125rem",
            opacity: 0.42,
          },
        },
        listbox: {
          padding: "4px 0",
          fontSize: "0.8125rem",
        },
        option: {
          textTransform: "none",
          fontSize: "0.8125rem",
          lineHeight: 1.3,
          minHeight: 36,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 12,
          paddingRight: 12,
        },
        paper: {
          fontSize: "0.8125rem",
        },
        popupIndicator: {
          padding: 4,
        },
        clearIndicator: {
          padding: 4,
        },
        noOptions: {
          fontSize: "0.8125rem",
          padding: "8px 12px",
        },
        loading: {
          fontSize: "0.8125rem",
          padding: "8px 12px",
        },
        tag: { textTransform: "none" },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { textTransform: "none" },
        outlined: {
          "&.MuiInputLabel-sizeSmall": {
            fontSize: "0.8125rem",
          },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: {
          textTransform: "none",
          "&.MuiInputBase-inputSizeSmall": {
            fontSize: "0.8125rem",
            "&::placeholder": {
              fontSize: "0.8125rem",
              opacity: 0.42,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          "&.MuiAutocomplete-tag": {
            height: 22,
            fontSize: "0.75rem",
          },
        },
        deleteIcon: {
          fontSize: "0.875rem",
        },
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={muiTheme}>
      <App />
    </ThemeProvider>
  </StrictMode>
);
