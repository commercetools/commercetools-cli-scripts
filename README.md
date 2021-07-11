# commercetools-cli-scripts
The repository provides a set of tools and examples based on commercetools nodejs SDK.

## Requirements
- Node.js version 16 ([install](https://nodejs.org/en/download))
- Npm version 7
- commercetools project credentials

## How to run
- Navigate with your terminal to the main directory and run:
```
npm install
```
- Navigate with your terminal to the desired script folder with the file named `run.js`.
- Export commercetools credentials as environment variables:

```
export PROJECT_KEY='<Your_Project_Key>' \
export CLIENT_ID='<Your_Client_ID>' \
export CLIENT_SECRET='<Your_Client_Secret>' 
```
- Run the script:
```
node run.js
```