# Concession Pass Calculator Backend

This project is a Node.js backend application designed to parse SimplyGo statement PDF files. It provides an API for uploading PDF files and extracting trip information.

## Features

- Upload SimplyGo statement PDF files.
- Parse the uploaded PDF files to extract trip data.
- Return the parsed trip data in a structured format.

## Technologies Used

- Node.js
- Express
- TypeScript
- pdf-parse
- Multer (for file uploads)

## Project Structure

```
concession-pass-calculator-backend
├── src
│   ├── index.ts                # Entry point of the application
│   ├── routes
│   │   └── pdf.routes.ts       # PDF-related routes
│   ├── controllers
│   │   └── pdf.controller.ts    # Controller for handling PDF uploads and parsing
│   ├── services
│   │   └── pdfParser.service.ts  # Service for parsing PDF files
│   ├── types
│   │   └── index.ts             # Type definitions
│   ├── middleware
│   │   ├── errorHandler.ts       # Error handling middleware
│   │   └── fileUpload.ts         # Middleware for handling file uploads
│   └── utils
│       └── validators.ts         # Utility functions for validation
├── package.json                  # NPM configuration
├── tsconfig.json                 # TypeScript configuration
├── .env.example                   # Example environment variables
├── .gitignore                    # Git ignore file
└── README.md                     # Project documentation
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   ```

2. Navigate to the project directory:
   ```
   cd concession-pass-calculator-backend
   ```

3. Install the dependencies:
   ```
   npm install
   ```

4. Create a `.env` file based on the `.env.example` file and configure your environment variables.

## Usage

1. Start the server:
   ```
   npm start
   ```

2. Use an API client (like Postman) to upload SimplyGo statement PDF files to the endpoint:
   ```
   POST /api/pdf/upload
   ```

3. The server will respond with the parsed trip data extracted from the PDF.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.