const express = require('express');
const chokidar = require('chokidar');
const http = require('http');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);



const folderPath = path.join(__dirname, '../src/assets/watched-folder'); // Folder to watch

// Enable CORS for all domains (or specify a specific domain)
app.use(cors({
  origin: 'http://localhost:4200', // Allow only the Angular app to access the backend
  methods: ['GET', 'POST'],
  credentials: true // Enable cookies if needed
}));

// Enable CORS
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:4200", // Angular app URL
    methods: ["GET", "POST"],
  },
});

io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});


// Watch the folder for changes
const watcher = chokidar.watch(folderPath, { persistent: true });

// watcher.on('add', (filePath) => {
//   console.log(`File added: ${filePath}`);
//   const latestFileData = parseFilePath(filePath);
//   console.log('Parsed File Dataon Change:', latestFileData);
//   io.emit('file-added', filePath); // Notify the frontend
// });
watcher.on('add', (filePath) => {
  console.log(`File added: ${filePath}`);

  try {
    // Extract file details (e.g., enrollId, name, and timestamp)
    const latestFileData = parseFilePath(filePath);
    console.log('Parsed File Data:', latestFileData);

     // Extract deviceId from filePath (modify this logic based on your folder structure)
     const pathParts = filePath.split(path.sep); // Split the path by separator
     const deviceId = pathParts[pathParts.length - 3]; // Adjust index based on folder structure
 
     console.log('Device ID:', deviceId);


    // Read the file and convert to Base64
    fs.readFile(filePath, (err, data) => {
      if (err) {
        console.error('Error reading file:', err);
        return;
      }

      // Convert the file data to Base64
      const base64Image = `data:image/jpeg;base64,${data.toString('base64')}`;
      console.log("Emitted FIle:", latestFileData.enrollId, latestFileData.name, latestFileData.timestamp);

      const payload = {
        deviceId,
        base64Image,
        enrollId: latestFileData.enrollId,
        name: latestFileData.name,
        timestamp: latestFileData.timestamp
    };

    console.log('Emitted Payload:', payload);
      // Emit the formatted data along with the Base64 image
      io.emit('file-added', payload);
    });
  } catch (error) {
    console.error('Error processing file:', error.message);
  }
});


// Serve static files from Angular app
app.use(express.static(path.join(__dirname, '../dist/file-watcher-app')));

// API to get the latest image for a selected Device ID and current date
app.get('/get-latest-image/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;
  const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // Format as yyyyMMdd
  const deviceFolderPath = path.join(folderPath, deviceId, currentDate);

  // Check if the folder for the device and date exists
  if (!fs.existsSync(deviceFolderPath)) {
    return res.status(404).send('Device folder not found.');
  }

  fs.readdir(deviceFolderPath, (err, files) => {
    if (err) {
      console.error('Error reading folder:', err);
      return res.status(500).send('Error reading folder.');
    }

    if (files.length === 0) {
      return res.status(404).send('No files found.');
    }

    try {
      // Sort files by timestamp (latest first)
      files.sort((a, b) => {
        const parseTimestamp = (fileName) => {
          const parts = fileName.replace('.jpg', '').split('~');
          if (parts.length !== 3) {
            throw new Error(`Invalid file format: ${fileName}`);
          }
          const timestamp = parts[2];
          if (!/^\d{14}$/.test(timestamp)) {
            throw new Error(`Invalid timestamp: ${timestamp}`);
          }
          return new Date(
            timestamp.replace(
              /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
              '$1-$2-$3T$4:$5:$6'
            )
          );
        };

        return parseTimestamp(b) - parseTimestamp(a);
      });

      const latestFile = files[0]; // Get the latest file
      console.log("latest data", latestFile);
      const filePath = path.join(deviceFolderPath, latestFile);
      console.log('Filepath', filePath);

     let [enrollId, name, timestamp] = latestFile.replace('.jpg', '').split('~');

     enrollId = enrollId;
     name = formatName(name);
     timestamp = formatTimestamp(timestamp);

  // Read the image file and convert it to base64
     fs.readFile(filePath, (err, data) => {
      if (err) {
      console.error('Error reading image file:', err);
      return res.status(500).send('Error reading image file.');
    }

     const base64Image = data.toString('base64');

    // Send the image in base64 format along with the details
     res.json({
      base64Image: `data:image/jpeg;base64,${base64Image}`, // Sending the base64 encoded image
      enrollId,
      name,
      timestamp,
     });
  });

    } catch (error) {
      console.error('Error processing files:', error.message);
      return res.status(500).send('Error processing files.');
    }
  });
});



// Fallback route for Angular's routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/file-watcher-app/index.html'));
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


// Function to format name (add space between first and last name)
function formatName(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// Function to format timestamp (yyyymmddhhmmss to dd MMM yyyy hh:mm:ss)
function formatTimestamp(timestamp) {
  const year = timestamp.substring(0, 4);
  const month = timestamp.substring(4, 6);
  const day = timestamp.substring(6, 8);
  const hours = timestamp.substring(8, 10);
  const minutes = timestamp.substring(10, 12);
  const seconds = timestamp.substring(12, 14);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const formattedDate = `${day} ${months[parseInt(month, 10) - 1]} ${year} ${hours}:${minutes}:${seconds}`;
  return formattedDate;
}

function parseFilePath(filePath) {
  const fileName = path.basename(filePath);
  const [enrollId, name, timestamp] = fileName.replace('.jpg', '').split('~');
  return {
    enrollId,
    name: formatName(name),
    timestamp: formatTimestamp(timestamp),
  };
}