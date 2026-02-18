# RikiTrakiLambda (RikiTrakiWS AWS Edition)

This repository contains the code for the web services supporting RikiTraki, an outdoor activities log web application.

The public Web Services and database are hosted entirely in **Amazon Web Services (AWS)**.

Data is maintained in DynamoDB and S3, with Lambda functions providing a secure, schema‑validated CRUD interface via REST APIs.

## Hosting & Deployment

Unlike the legacy version, this project is **not intended for self‑hosting**.

All infrastructure is provisioned in AWS using [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/) and follows least‑privilege IAM policies.  

The project is focused on a managed service model, though the open templates make self‑hosting technically possible if desired.

## System Architecture

![System Architecture](https://www.plantuml.com/plantuml/png/JP7FJW8n4CRlVOe9T-A1cmV3uaOaWKXO3EUXEsXZsrdROSbgJ7m5Nz4dSNR1wAcTx_TDvq-dMJ39CNWZJZn1rMMX02Krdhj0KU2XfTGwEXc3LZZ1hNSg6nEv9XWLkmeAQ_aOPGJl1k0YhnSmHw4JTYF031hF_w3cB37iQnpOibZDoa9fZO9xpEeekuY1ozd0otAcyC2-fgJ90TyuGZNfcHxcmvXpIp0Utmo5u1hkjzjr1HjwFL8MCuXABwMKBsBBBsJEyO2qYkeRmlfgbvmGh4Ymx-Y_gPgevr5Newux4lkihjfXlmpDsBC81-33xqYBOWKDUsSTPQ1uu6G9F66Mxy-l9hdMUNeYWpPnpe3UW-NGSDHXig5OG_-iCLEzwW_z0000)


## System Building Blocks

Key components:
- **AWS Lambda**: Stateless handlers for tracks, users, authentication, and media.
- **Amazon API Gateway (HTTP API)**: Public REST endpoints with CORS and JWT authorization.
- **Amazon DynamoDB**: Track metadata and user profiles.
- **Amazon S3**: GPX files, thumbnails, and full‑resolution pictures.
- **JWT Authentication**: Tokens issued and verified by Lambda functions.
- **CloudWatch Logs**: Centralized logging and error monitoring.

Environment variables required by Lambda handlers:
- `TABLE_NAME` – DynamoDB table for track and user metadata.
- `INDEX_NAME` – DynamoDB index for track queries.
- `BUCKET_NAME` – S3 bucket for GPX and images.
- `JWT_SECRET` – Secret for signing and verifying JWT tokens (stored in SSM).
- `JWT_ISSUER` – Issuer string for JWT tokens.
- `MAILGUN_API_KEY` – Used for user creation and reset flows (stored in SSM).

All handlers are tested with deterministic Jest suites and validated against JSON schemas.

## API

URL Format:  
`https://<api-id>.execute-api.<region>.amazonaws.com/Prod/{resource}`  
Example: `https://<api-id>.execute-api.us-west-2.amazonaws.com/Prod/tracks`

All results are JSON except images and GPX files.  
**SSL is required for all calls.**

**Resources**

| Resource | Verb | Description | Status Codes | Function Name |
|----------|------|-------------|--------------|---------------|
| `/token` | GET | Retrieves a new JWT token for API calls. Requires basic authentication (username/password). | 200&nbsp;Success<br>401&nbsp;Unauthorized<br>403&nbsp;User inactive<br>500&nbsp;Server error | `getToken` |
| `/resettoken` | GET | Requests a JWT token via email for password reset. | 200&nbsp;Success<br>400&nbsp;Invalid input<br>404&nbsp;User&nbsp;not&nbsp;found<br>500&nbsp;Server error | `getResetToken` |
| `/users` | POST | Registers a new user. Requires account activation via email. | 201&nbsp;Success<br>400&nbsp;Invalid&nbsp;input<br>422&nbsp;Duplicate<br>500&nbsp;Server&nbsp;error | `createUser` |
| `/users/me` | GET | Retrieves user profile info for the JWT token holder. | 200&nbsp;Success<br>401&nbsp;Unauthorized<br>404&nbsp;User&nbsp;not&nbsp;found<br>500&nbsp;Server&nbsp;error | `getUserInfo` |
| `/users/me` | PUT | Updates user profile info (email and password). Requires basic authentication (username/password). | 204&nbsp;Success<br>400&nbsp;Invalid&nbsp;input<br>401&nbsp;Unauthorized<br>404&nbsp;User&nbsp;not&nbsp;found<br>422&nbsp;Duplicate<br>500&nbsp;Server&nbsp;error | `updateUserProfile` |
| `/users/{username}` | PUT | Updates user password. Requires a valid JWT reset token. | 204&nbsp;Success<br>400&nbsp;Invalid&nbsp;input<br>401&nbsp;Unauthorized<br>500&nbsp;Server&nbsp;error | `resetPassword` |
| `/users/{username}/activation` | PUT | Activates a user account. Requires valid JWT. | 204&nbsp;Success<br>400&nbsp;Invalid&nbsp;input<br>401&nbsp;Unauthorized<br>403&nbsp;Token&nbsp;mismatch<br>404&nbsp;User&nbsp;not&nbsp;found<br>500&nbsp;Server&nbsp;error | `activateAccount` |
| `/tracks` | GET | Returns the latest MAX_TRACKS (limit 5000). | 200&nbsp;Success<br>404&nbsp;Not&nbsp;found<br>500&nbsp;Server&nbsp;error | `getTracks` |
| `/tracks/number` | GET | Returns the total number of tracks. | 200&nbsp;Success<br>500&nbsp;Server&nbsp;error | `getNumberOfTracks` |
| `/tracks` | POST | Creates a new track. Requires valid JWT. Returns trackId. | 201&nbsp;Success<br>400&nbsp;Invalid&nbsp;input<br>401&nbsp;Unauthorized<br>500&nbsp;Server&nbsp;error | `createTrack` |
| `/tracks/{trackId}` | GET | Returns a single track. | 200&nbsp;Success<br>400&nbsp;Invalid&nbsp;input<br>404&nbsp;Not&nbsp;found<br>500&nbsp;Server&nbsp;error | `getTrack` |
| `/tracks/{trackId}` | PUT | Updates track info. Requires valid JWT. | 200&nbsp;Success<br>400&nbsp;Invalid&nbsp;input<br>401&nbsp;Unauthorized<br>404&nbsp;Not&nbsp;found<br>500&nbsp;Server&nbsp;error | `updateTrack` |
| `/tracks/{trackId}` | DELETE | Deletes track and associated images. Requires valid JWT. | 204&nbsp;Success<br>401&nbsp;Unauthorized<br>403&nbsp;Forbidden<br>500&nbsp;Server&nbsp;error | `deleteTrack` |
| `/tracks/{trackId}/GPX` | GET | Returns GPX file in application/gpx+xml. | 200&nbsp;Success<br>404&nbsp;Not&nbsp;found | `getTrackGPX` |
| `/tracks/{trackId}/geotags` | GET | Returns photo geotags for a track. | 200&nbsp;Success<br>404&nbsp;Not&nbsp;found<br>500&nbsp;Server&nbsp;error | `getTrackGeotags` |
| `/tracks/{trackId}/thumbnail/{picIndex}` | GET | Returns thumbnail image (JPEG). | 200&nbsp;Success<br>404&nbsp;Not&nbsp;found | `getThumbnail` |
| `/tracks/{trackId}/picture/{picIndex}` | GET | Returns full‑resolution picture (JPEG). | 200&nbsp;Success<br>404&nbsp;Not&nbsp;found | `getPicture` |
| `/tracks/{trackId}/picture/{picIndex}` | POST | Uploads a picture (JPEG). Requires valid JWT. | 201&nbsp;Success<br>401&nbsp;Unauthorized<br>413&nbsp;Too&nbsp;large<br>500&nbsp;Server&nbsp;error | `addPicture` |
| `/tracks/{trackId}/picture/{picIndex}` | DELETE | Deletes a picture. Requires valid JWT. | 204&nbsp;Success<br>404&nbsp;Not&nbsp;found<br>500&nbsp;Server&nbsp;error | `deletePicture` |
| `/motd` | GET | Returns the five most recent tracks with pictures. | 200&nbsp;Success<br>500&nbsp;Server&nbsp;error | `getMotd` |
| `/loctracks` | GET | Returns tracks near a given location. Accepts lat, lon, and optional username. Computes search radius server‑side and returns up to 200 nearby tracks. If not enough tracks, expands radius to return at least 10 tracks. | 200&nbsp;Success<br>400&nbsp;Bad&nbsp;request<br>500&nbsp;Server&nbsp;error | `getTracksByLoc` |
| `/usermotd/{username}` | GET | Returns the five most recent tracks with pictures for a given user. If the user name is ommitted then it is equivalent to /motd (global).| 200&nbsp;Success<br>500&nbsp;Server&nbsp;error | `getMotd` |

---

**NOTE: RikiTrakiWS (AWS Edition) is in beta.**  
Self‑hosting is no longer supported; all services run in AWS. Contributions are welcome via pull requests.

## Development & Testing

To run the test suite locally:

```bash
npm install
npm test
```

Tests are written with Jest and mock AWS SDK clients for deterministic results. Each handler has a corresponding ```*.test.mjs file``` under ```tests/unit```.

## Contributing

Developers interested in contributing are welcome to use their own AWS dev accounts to test and validate changes. These accounts are not managed by the project maintainers. All contributions should be submitted via pull requests, which will be reviewed for alignment with project standards before merging.

---
*This project was developed with the assistance of Microsoft Copilot.*