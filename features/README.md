To run the script under preview mode, please go to the `/features/vat-replacement` folder and input the following command:
```
node run.js
```
It will generate and print out a JSON with new new tax category VAT rates. You can verify the correctness of the VAT details. 

Script can generate the following warnings:
1. No German tax categories / tax rates found.
2. Tax rates detected which are neither standard VAT 19% nor reduced VAT 7%. 
3. More than one standard-/reduced-VAT found.

----------------

To apply the VAT changes please run the script with `-update` parameter.
```
node run.js -update
```
WARNING! In this mode, script replaces the current VAT rates with the new VAT rates automatically.
Please resolve all warnings under preview mode before you decide to run it under the update mode.
 