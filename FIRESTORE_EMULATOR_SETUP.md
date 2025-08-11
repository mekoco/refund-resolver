# Firestore Emulator Setup Guide

## Prerequisites

1. **Node.js**: Version 10.0.0 or higher
2. **Java Runtime**: Required for the emulator to run
   ```bash
   # Install Java on Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install -y default-jre
   
   # Verify installation
   java -version
   ```

3. **Firebase CLI**: Install globally
   ```bash
   npm install -g firebase-tools
   
   # Verify installation
   firebase --version
   ```

## Setup Steps

### Step 1: Create Firebase Configuration

Create a `firebase.json` file in your project root:

```json
{
  "emulators": {
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4040
    },
    "singleProjectMode": false,
    "auth": {
      "port": 9099
    },
    "storage": {
      "port": 9199
    }
  }
}
```

### Step 2: Start the Emulator

Run the emulator with a demo project:

```bash
firebase emulators:start --project=demo-test
```

**Note**: Any project ID starting with "demo-" will work for local emulation without requiring a real Firebase project.

### Step 3: Access the Emulator

Once running, you can access:

- **Emulator UI**: http://127.0.0.1:4040/
- **Firestore**: http://127.0.0.1:4040/firestore
- **Authentication**: http://127.0.0.1:4040/auth
- **Storage**: http://127.0.0.1:4040/storage

## Available Services

| Emulator       | Host:Port      | Purpose                          |
|----------------|----------------|----------------------------------|
| Authentication | 127.0.0.1:9099 | User authentication emulation   |
| Firestore      | 127.0.0.1:8080 | Database emulation              |
| Storage        | 127.0.0.1:9199 | File storage emulation          |

## Data Persistence (Optional)

To persist data between emulator sessions:

```bash
# Start with data export on exit
firebase emulators:start --project=demo-test --export-on-exit=./emulator-data

# Import previously exported data
firebase emulators:start --project=demo-test --import=./emulator-data
```

## Connecting Your Application

### Backend Configuration

Update your backend code to connect to the emulator instead of production Firebase:

```javascript
// For Admin SDK (Node.js backend)
import * as admin from 'firebase-admin';

// Initialize admin SDK
admin.initializeApp({
  projectId: 'demo-test',
});

// Connect to Firestore emulator
const db = admin.firestore();
if (process.env.NODE_ENV === 'development') {
  db.settings({
    host: 'localhost:8080',
    ssl: false
  });
}
```

### Frontend Configuration

```javascript
// For Web SDK (React/Vue/Angular)
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const app = initializeApp({
  projectId: 'demo-test',
  // Other config...
});

const db = getFirestore(app);

// Connect to emulator
if (process.env.NODE_ENV === 'development') {
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

## Important Notes

1. **Security Rules**: The emulator defaults to allowing all reads and writes. For production-like testing, add a `firestore.rules` file.

2. **Data Loss**: By default, all data is lost when the emulator stops. Use the export/import flags for persistence.

3. **Demo Project**: Using a project ID starting with "demo-" ensures the emulator runs in demo mode without requiring Firebase authentication.

4. **Port Conflicts**: If ports are in use, modify them in `firebase.json`.

## Troubleshooting

- **Java not found**: Ensure Java is installed and in your PATH
- **Port already in use**: Change ports in `firebase.json`
- **Permission denied**: Run without `sudo`, the emulator doesn't require elevated permissions
- **Emulator not connecting**: Check firewall settings and ensure localhost is accessible

## Useful Commands

```bash
# Start emulator
firebase emulators:start --project=demo-test

# Start with specific emulators only
firebase emulators:start --only firestore --project=demo-test

# Clear all Firestore data (while emulator is running)
curl -X DELETE "http://localhost:8080/emulator/v1/projects/demo-test/databases/(default)/documents"

# Stop emulator
Ctrl+C in the terminal
```