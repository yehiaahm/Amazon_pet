# Owner PIN recovery (hosted / Railway)

## Why this exists

A fresh database seeds `owner_marwan` with a **random** PIN and logs it exactly once
(`DatabaseSeeder.createDefaultEmployees`). That is deliberate — shipping a fixed, guessable
PIN was a real vulnerability. On a hosted deployment, though, that single log line is easy to
lose (deploy logs roll off), and unlike the desktop install there is no local database file to
open with a SQL client. The result is a live shop with nobody able to log in.

`OwnerPinRecoveryService` is the way back in.

## How to use it

1. In the deployment's variables (Railway → service → **Variables**) add:

   ```
   APP_OWNER_PIN_RESET=2026
   ```

   Any 4–8 digit PIN works; `2026` matches what the shop is used to.

2. Save. Railway redeploys on a variable change; on any other host, restart the service.

3. Log in with that PIN on the keypad. The startup log records:

   ```
   Owner PIN recovery applied to account 'owner_marwan' from APP_OWNER_PIN_RESET.
   ```

4. **Delete the variable** once you are in.

## Why it is safe to forget step 4

* It is a **startup-only** path. No HTTP endpoint is added, so there is nothing on the network
  an attacker can reach — reaching it requires already controlling the deployment's environment.
* Each distinct value is applied **exactly once**. The applied value's SHA-256 is stored in
  `admin_pin_reset_marker` (migration `V55`), and later boots skip it:

  ```
  Owner PIN recovery for the current APP_OWNER_PIN_RESET value was already applied — skipping.
  ```

  So a variable left behind cannot silently restore the old PIN after the owner changes it —
  the exact failure mode `syncKnownAccountPins` already guards against elsewhere.

## Running the same reset a second time

Because the marker keys on the whole value, `APP_OWNER_PIN_RESET=2026` only ever applies once.
To reset to 2026 again later (PIN changed and forgotten again), append a nonce after a colon —
the PIN is the part before it:

```
APP_OWNER_PIN_RESET=2026:2
```

## Notes

* Only the OWNER account is touched (`owner_marwan`, falling back to employee `e-1`, then to the
  first `OWNER`-role employee). Cashier and groomer PINs are left alone.
* A malformed value (PIN not 4–8 digits) is logged as an error and ignored — it never blocks boot.
* The PIN itself is never written to the log; it is already in the deployment's variables.
