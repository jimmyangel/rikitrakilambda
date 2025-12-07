# RikiTrakiWS (AWS Edition)

This repository contains the code for the web services supporting [RikiTraki](https://www.rikitraki.com), an outdoor activities log web application.  
The public Web Services and database are now hosted entirely in **Amazon Web Services (AWS)**.  
Data is maintained in DynamoDB and S3, with Lambda functions providing a secure, schema‑validated CRUD interface via REST APIs.

## Hosting & Deployment

Unlike the legacy version, this project is **not intended for self‑hosting**.  
All infrastructure is provisioned in AWS using [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/) and follows least‑privilege IAM policies.

Key components:
- **AWS Lambda**: Stateless handlers for tracks, users, authentication, and media.
- **Amazon API Gateway (HTTP API)**: Public REST endpoints with CORS and JWT authorization.
- **Amazon DynamoDB**: Track metadata, user profiles, and activation codes.
- **Amazon S3**: GPX files, thumbnails, and full‑resolution pictures.
- **JWT Authentication**: Tokens issued and verified by Lambda functions.
- **CloudWatch Logs**: Centralized logging and error monitoring.

Environment variables required by Lambda handlers:
- `TABLE_NAME` – DynamoDB table for track and user metadata.
- `INDEX_NAME` – DynamoDB index for track queries.
- `BUCKET_NAME` – S3 bucket for GPX and images.
- `JWT_SECRET` – Secret for signing and verifying JWT tokens (stored in SSM).
- `JWT_ISSUER` – Issuer string for JWT tokens.
- `MAILGUN_API_KEY` – Used for user creation and reset flows.

All handlers are tested with deterministic Jest suites and validated against JSON schemas.

## API

URL Format:  
`{service-url}/api/{version}/{resource}`  
Example: `https://www.rikitraki.com/api/v1/tracks`

All results are JSON except images and GPX files.  
SSL is required on all authenticated/authorized calls.

**Resources**

| Resource | Verb | Description | Status Codes | Function Name |
|----------|------|-------------|--------------|---------------|
| `/token` | GET | Retrieves a new JWT token for API calls. Requires basic authentication (userid/password). | 200 Success<br>401 Unauthorized | `getToken` |
| `/resettoken` | GET | Requests a JWT token for password reset. | 200 Success<br>404 User not found | `getResetToken` |
| `/users` | POST | Registers a new user. Requires a valid activation code. | 201 Success<br>400 Invalid input<br>401 Unauthorized<br>422 Duplicate<br>507 Database error | `createUser` |
| `/users/me` | GET | Retrieves user profile info for the JWT token holder. | 200 Success<br>401 Unauthorized<br>404 User not found | `getUserInfo` |
| `/users/me` | PUT | Updates user profile info. Requires valid JWT. | 204 Success<br>400 Invalid input<br>401 Unauthorized<br>404 User not found<br>422 Duplicate email<br>507 Database error | `updateUserProfile` |
| `/users/{username}` | PUT | Updates user password. Requires a valid JWT reset token. | 204 Success<br>400 Invalid input<br>401 Unauthorized<br>507 Database error | `resetPassword` |
| `/users/{username}/activation` | PUT | Activates a user account. | 204 Success<br>400 Invalid input<br>401 Unauthorized<br>404 User not found | `activateAccount` |
| `/tracks` | GET | Returns the latest MAX_TRACKS (limit 5000). | 200 Success<br>404 Not found | `getTracks` |
| `/tracks/number` | GET | Returns the total number of tracks. | 200 Success | `getNumberOfTracks` |
| `/tracks` | POST | Creates a new track. Requires valid JWT. Returns trackId. | 201 Success<br>400 Invalid input<br>401 Unauthorized<br>507 Database error | `createTrack` |
| `/tracks/{trackId}` | GET | Returns a single track. | 200 Success<br>404 Not found | `getTrack` |
| `/tracks/{trackId}` | PUT | Updates track info. Requires valid JWT. | 200 Success<br>400 Invalid input<br>401 Unauthorized<br>403 Forbidden<br>507 Database error | `updateTrack` |
| `/tracks/{trackId}` | DELETE | Deletes track and associated images. Requires valid JWT. | 204 Success<br>401 Unauthorized<br>403 Forbidden<br>507 Database error | `deleteTrack` |
| `/tracks/{trackId}/GPX` | GET | Returns GPX file in `application/gpx+xml`. | 200 Success<br>404 Not found | `getTrackGPX` |
| `/tracks/{trackId}/geotags` | GET | Returns photo geotags for a track. | 200 Success<br>404 Not found | `getTrackGeotags` |
| `/tracks/{trackId}/thumbnail/{picIndex}` | GET | Returns thumbnail image (JPEG). | 200 Success<br>404 Not found | `getThumbnail` |
| `/tracks/{trackId}/picture/{picIndex}` | GET | Returns full‑resolution picture (JPEG). | 200 Success<br>404 Not found | `getPicture` |
| `/tracks/{trackId}/picture/{picIndex}` | POST | Uploads a picture (JPEG). Requires valid JWT. | 201 Success<br>404 Not found<br>507 Database error | `addPicture` |
| `/tracks/{trackId}/picture/{picIndex}` | DELETE | Deletes a picture. Requires valid JWT. | 204 Success<br>404 Not found<br>507 Database error | `deletePicture` |
| `/motd` | GET | Returns the “message of the day” (MOTD). | 200 Success<br>404 Not found | `getMotd` |

---

**NOTE: RikiTrakiWS (AWS Edition) is in beta.**  
Self‑hosting is no longer supported; all services run in AWS. Contributions are welcome via pull requests.

## Development & Testing

To run the test suite locally:

```bash
npm install
npm test
