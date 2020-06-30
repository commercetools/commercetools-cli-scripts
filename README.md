# commercetools-cli-scripts
Collection of node.js based scripts and utils for CTP resource management

## Requirements
Download Node.js installer
https://nodejs.org/en/download/

## Setup
Inside /features/shared folder, input following command in terminal to install required javascript library

```
npm install node-fetch --save 
npm install lodash --save 
npm install @commercetools/sdk-client --save 
npm intsall @commercetools/sdk-middleware-auth --save 
npm install @commercetools/sdk-middleware-http --save 
npm install @commercetools/sdk-middleware-queue --save 
npm install @commercetools/api-request-builder --save 
```

Inside /features/vat-replacement folder, input following command in terminal to install required javascript library
```
npm install bluebird --save
```

To enable the script to make connection to CTP API, please input project ID, client ID and client secret as 
environment variables in terminal.
```
export PROJECT_KEY='<Your_Project_Key>' \
export CLIENT_ID='<Your_Client_ID>' \
export CLIENT_SECRET='<Your_Client_Secret>' 
```

## Run
To run the script under preview mode, please go to the /features/vat-replacement folder and input following command
```
node run.js
```
It will print out resultant JSON including a new VAT rate. Customers can verify the correctness of VAT details. 

Script triggers warnings in following conditions :
1. None of tax categories / tax rates under specific project is from Germany.
2. Some tax rates are found which are not VAT. i.e. Neither standard VAT 19% nor reduced VAT 7%. 
3. More than one standard VAT / reduced VAT are found.

----------------

To run the script under update mode, please go to the /features/vat-replacement folder and input following command
```
node run.js -update
```
BE CAREFUL!!! Under update mode, script replaces the current VAT rates by new VAT rates automatically. 
Please resolve all warnings under preview mode before you decide to run it under update mode.
 