import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from "@mui/material";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import InboxIcon from "@mui/icons-material/Inbox";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NOTIFICATION_TYPES,
  fetchNotifications,
  fetchPriorityNotifications,
} from "./api";
import { readViewedIds, writeViewedIds } from "./viewedStore";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1f6f8b",
    },
    secondary: {
      main: "#2e7d32",
    },
    background: {
      default: "#f4f7f9",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: "Inter, Roboto, Arial, sans-serif",
    h1: {
      fontSize: "clamp(1.6rem, 3vw, 2.5rem)",
      fontWeight: 800,
    },
    h2: {
      fontSize: "1.25rem",
      fontWeight: 800,
    },
    button: {
      textTransform: "none",
      fontWeight: 700,
    },
  },
});

const typeColor = {
  Placement: "success",
  Result: "primary",
  Event: "warning",
};

function getInitialPage() {
  return window.location.pathname === "/priority" ? "priority" : "notifications";
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "Unknown time";
  }

  return timestamp;
}

function App() {
  const [page, setPage] = useState(getInitialPage);
  const [viewedIds, setViewedIds] = useState(() => readViewedIds());

  const markViewed = useCallback((id) => {
    setViewedIds((current) => {
      const next = new Set(current);
      next.add(id);
      writeViewedIds(next);
      return next;
    });
  }, []);

  const markManyViewed = useCallback((notifications) => {
    setViewedIds((current) => {
      const next = new Set(current);
      notifications.forEach((notification) => next.add(notification.ID));
      writeViewedIds(next);
      return next;
    });
  }, []);

  const handlePageChange = (nextPage) => {
    setPage(nextPage);
    window.history.pushState(null, "", nextPage === "priority" ? "/priority" : "/notifications");
  };

  useEffect(() => {
    const onPopState = () => setPage(getInitialPage());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar position="sticky" color="inherit" elevation={0}>
          <Toolbar sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ alignItems: { xs: "flex-start", sm: "center" }, width: "100%" }}
            >
              <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", flexGrow: 1 }}>
                <NotificationsActiveIcon color="primary" />
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    AffordMed Evaluation
                  </Typography>
                  <Typography variant="h1">Notification Inbox</Typography>
                </Box>
              </Stack>
              <Tabs value={page} onChange={(_, value) => handlePageChange(value)}>
                <Tab icon={<InboxIcon />} iconPosition="start" label="All" value="notifications" />
                <Tab
                  icon={<PriorityHighIcon />}
                  iconPosition="start"
                  label="Priority"
                  value="priority"
                />
              </Tabs>
            </Stack>
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
          {page === "priority" ? (
            <PriorityPage
              markManyViewed={markManyViewed}
              markViewed={markViewed}
              viewedIds={viewedIds}
            />
          ) : (
            <NotificationsPage
              markManyViewed={markManyViewed}
              markViewed={markViewed}
              viewedIds={viewedIds}
            />
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}

function NotificationsPage({ markManyViewed, markViewed, viewedIds }) {
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [notificationType, setNotificationType] = useState("All");
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchNotifications({ limit, page, notificationType });
      setNotifications(data.notifications);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [limit, page, notificationType]);

  useEffect(() => {
    load();
  }, [load]);

  const newCount = useMemo(
    () => notifications.filter((notification) => !viewedIds.has(notification.ID)).length,
    [notifications, viewedIds]
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        title="All Notifications"
        description="Browse the protected notification API with pagination and type filters."
        action={
          <Button
            startIcon={<DoneAllIcon />}
            variant="contained"
            onClick={() => markManyViewed(notifications)}
            disabled={!notifications.length}
          >
            Mark page viewed
          </Button>
        }
      />

      <FilterPanel>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4} md={3}>
            <NumberField label="Limit" value={limit} min={5} max={10} onChange={setLimit} />
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <NumberField label="Page" value={page} min={1} max={999} onChange={setPage} />
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <TypeSelect value={notificationType} onChange={setNotificationType} />
          </Grid>
          <Grid item xs={12} md={3}>
            <Button fullWidth startIcon={<RefreshIcon />} variant="outlined" onClick={load}>
              Refresh
            </Button>
          </Grid>
        </Grid>
      </FilterPanel>

      <SummaryStrip
        items={[
          ["Showing", notifications.length],
          ["New on page", newCount],
          ["Filter", notificationType],
        ]}
      />

      <NotificationResults
        emptyText="No notifications found for this page."
        error={error}
        loading={loading}
        markViewed={markViewed}
        notifications={notifications}
        viewedIds={viewedIds}
      />
    </Stack>
  );
}

function PriorityPage({ markManyViewed, markViewed, viewedIds }) {
  const [limit, setLimit] = useState(10);
  const [scanLimit, setScanLimit] = useState(100);
  const [notificationType, setNotificationType] = useState("All");
  const [notifications, setNotifications] = useState([]);
  const [totalFetched, setTotalFetched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchPriorityNotifications({
        limit,
        notificationType,
        scanLimit,
      });
      setNotifications(data.priorityNotifications);
      setTotalFetched(data.totalFetched);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [limit, scanLimit, notificationType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Priority Notifications"
        description="Top notifications are ranked by type weight first, then by recency."
        action={
          <Button
            startIcon={<DoneAllIcon />}
            variant="contained"
            onClick={() => markManyViewed(notifications)}
            disabled={!notifications.length}
          >
            Mark top viewed
          </Button>
        }
      />

      <FilterPanel>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4} md={3}>
            <NumberField label="Top N" value={limit} min={1} max={50} onChange={setLimit} />
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <NumberField
              label="Scan limit"
              value={scanLimit}
              min={limit}
              max={100}
              onChange={setScanLimit}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <TypeSelect value={notificationType} onChange={setNotificationType} />
          </Grid>
          <Grid item xs={12} md={3}>
            <Button fullWidth startIcon={<RefreshIcon />} variant="outlined" onClick={load}>
              Refresh
            </Button>
          </Grid>
        </Grid>
      </FilterPanel>

      <SummaryStrip
        items={[
          ["Top", limit],
          ["Fetched", totalFetched],
          ["Rule", "Placement > Result > Event"],
        ]}
      />

      <NotificationResults
        emptyText="No priority notifications found."
        error={error}
        loading={loading}
        markViewed={markViewed}
        notifications={notifications}
        showRank
        viewedIds={viewedIds}
      />
    </Stack>
  );
}

function PageHeader({ action, description, title }) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }} variant="outlined">
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h2">{title}</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        </Box>
        {action}
      </Stack>
    </Paper>
  );
}

function FilterPanel({ children }) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      {children}
    </Paper>
  );
}

function NumberField({ label, max, min, onChange, value }) {
  return (
    <TextField
      fullWidth
      inputProps={{ max, min }}
      label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      size="small"
      type="number"
      value={value}
    />
  );
}

function TypeSelect({ onChange, value }) {
  return (
    <FormControl fullWidth size="small">
      <InputLabel id="type-label">Type</InputLabel>
      <Select
        label="Type"
        labelId="type-label"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {NOTIFICATION_TYPES.map((type) => (
          <MenuItem key={type} value={type}>
            {type}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function SummaryStrip({ items }) {
  return (
    <Grid container spacing={2}>
      {items.map(([label, value]) => (
        <Grid item xs={12} sm={4} key={label}>
          <Paper sx={{ p: 2 }} variant="outlined">
            <Typography color="text.secondary" variant="body2">
              {label}
            </Typography>
            <Typography sx={{ mt: 0.5 }} variant="h2">
              {value}
            </Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

function NotificationResults({
  emptyText,
  error,
  loading,
  markViewed,
  notifications,
  showRank = false,
  viewedIds,
}) {
  if (loading) {
    return (
      <Paper sx={{ p: 4, textAlign: "center" }} variant="outlined">
        <CircularProgress />
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Loading notifications
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!notifications.length) {
    return <Alert severity="info">{emptyText}</Alert>;
  }

  return (
    <Grid container spacing={2}>
      {notifications.map((notification, index) => (
        <Grid item xs={12} md={6} key={notification.ID}>
          <NotificationCard
            isViewed={viewedIds.has(notification.ID)}
            markViewed={markViewed}
            notification={notification}
            rank={showRank ? index + 1 : undefined}
          />
        </Grid>
      ))}
    </Grid>
  );
}

function NotificationCard({ isViewed, markViewed, notification, rank }) {
  const type = notification.Type;

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isViewed ? "divider" : "primary.main",
        bgcolor: isViewed ? "background.paper" : "rgba(31, 111, 139, 0.06)",
        height: "100%",
      }}
    >
      <CardContent>
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              {rank ? <Chip color="secondary" label={`#${rank}`} size="small" /> : null}
              <Chip color={typeColor[type] || "default"} label={type} size="small" />
              <Chip
                color={isViewed ? "default" : "primary"}
                label={isViewed ? "Viewed" : "New"}
                size="small"
                variant={isViewed ? "outlined" : "filled"}
              />
            </Stack>
            <Button
              disabled={isViewed}
              onClick={() => markViewed(notification.ID)}
              size="small"
              variant={isViewed ? "text" : "outlined"}
            >
              Mark viewed
            </Button>
          </Stack>

          <Typography variant="h2">{notification.Message}</Typography>
          <Typography color="text.secondary">{formatTimestamp(notification.Timestamp)}</Typography>
          <Divider />
          <Typography
            color="text.secondary"
            sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
            variant="caption"
          >
            {notification.ID}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default App;
