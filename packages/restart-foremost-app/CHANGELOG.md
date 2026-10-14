# Restart Foremost App Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Restart the frontmost app: quit it, wait for exit, relaunch, and verify it came back
- Race-free kill-then-relaunch: polls for real process death (with SIGKILL escalation) and verifies a fresh PID after relaunch
- Blacklist protecting Finder and Raycast from being restarted
