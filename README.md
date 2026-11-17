# Bidder Battle — unofficial multiplayer web adaptation

A static HTML/CSS/JavaScript multiplayer storage-auction game. Vercel serves the frontend; Firebase Authentication and Realtime Database provide anonymous player identities and live room updates.

**This is an unofficial fan-made digital adaptation.** It is not affiliated with or endorsed by Running Innovation LLC. The app uses original sample item names, event effects, illustrations, and styling. All money is pretend in-game currency; there are no payments, purchases, cash prizes, or real-money wagers.

## Included

- 3–7 players per room, with shareable 5-character room codes
- Live multiplayer lobby and presence indicators
- $5,000 virtual starting cash per player
- Two auctioneer rotations (each player is scheduled as auctioneer twice)
- Storage-unit cards with item count, flip, and peek rules
- $100 buy-in, $100 bid increments, pass/raise flow, and $1,000 in-game default fine
- Private peeks: each player can inspect one hidden item when the unit permits it
- Original item cards and event effects, hidden until the unit is won
- Each player's item stash is private during play; final values appear on the scoreboard
- Final score = remaining cash + item value
- Responsive layout and a How to Play guide
- Dark mode enabled by default, with a header toggle to switch to the original warm light theme; preference is saved in the browser

## 1. Create a Firebase project (free Spark plan)

1. Open [Firebase Console](https://console.firebase.google.com/) and select **Add project**.
2. Give it a project name, for example `bidder-battle-room`. You can leave Google Analytics turned off for this game.
3. In the project, open **Build → Authentication → Get started**.
4. Open **Sign-in method**, enable **Anonymous**, and save.
5. Open **Build → Realtime Database → Create Database**.
6. Choose a database location reasonably close to your players. Start in **locked mode**; you will add the app's restricted rules in step 8.
7. Open **Project settings** (gear icon) → **General** → **Your apps** → Add app → Web (`</>`). Register an app name such as `Bidder Battle Web`.
8. Copy the Firebase web app configuration. Open `firebase-config.js` in this project and replace the sample values with your actual `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.
   - Find the exact Realtime Database URL in **Build → Realtime Database**. It typically looks like `https://YOUR-DATABASE-NAME-default-rtdb.REGION.firebasedatabase.app` or `https://YOUR-PROJECT-ID-default-rtdb.firebaseio.com`.
   - Do not guess the database URL; copy the one shown in the Firebase console.
9. In **Realtime Database → Rules**, replace the rules with the complete contents of `database.rules.json`, then click **Publish**.
10. Open **Authentication → Settings → Authorized domains**. Add your Vercel domain (for example, `your-project.vercel.app`) after the first deployment. Keep `localhost` in the list for local testing.

The Firebase web config is intended to be present in browser code. The security boundary is the Realtime Database rules and the anonymous authenticated UID, not secrecy of the config values. Do not put service-account keys or Admin SDK credentials in this project.

## 2. Run it locally

Because the app uses JavaScript modules, open it through a local web server rather than double-clicking `index.html`.

**Option A — VS Code**

1. Open the `bidder-battle` folder in VS Code.
2. Install the **Live Server** extension if needed.
3. Right-click `index.html` and choose **Open with Live Server**.

**Option B — Python**

From the project folder, run:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173` in your browser.

Test multiplayer by opening the same room link in another browser profile or an incognito window. Create a room in one window, copy the invite link, and join it in the other. You need at least three players to start the game.

## 3. Deploy free on Vercel

1. Create a GitHub repository and upload the contents of this folder (`index.html`, `styles.css`, `app.js`, `firebase-config.js`, `database.rules.json`, `vercel.json`, and this README).
2. Sign in at [Vercel](https://vercel.com/) and choose **Add New → Project**.
3. Import the GitHub repository.
4. Framework preset: **Other**. Build command: leave blank. Output directory: leave blank (the project root is the static output).
5. Click **Deploy**. Vercel will provide a public HTTPS URL.
6. Open that URL and test Create Room / Join Room from two or more devices.
7. If anonymous sign-in is rejected, return to Firebase **Authentication → Settings → Authorized domains** and add the exact `*.vercel.app` hostname shown in your deployment URL.

If you edit the code later, push the changes to GitHub; Vercel will redeploy automatically.

## 4. Check the free-tier limits

- Firebase Realtime Database's no-cost Spark allowance currently includes **1 GB stored data** and **10 GB/month of downloads**; Spark is limited to **100 simultaneous database connections**. A game browser tab counts as a connection, so this build is suited to small groups and casual play, not large public tournaments. Firebase may stop database service when Spark quotas are exceeded rather than silently charging overages.
- Vercel Hobby is free for personal, non-commercial projects, subject to its published fair-use and resource limits. Check the latest Vercel terms before using it for a commercial or public business deployment.
- Firebase Authentication's Anonymous provider is used; no email address or password is collected.

## 5. How a game works

1. One person creates a room and shares the 5-character code/link.
2. Three to seven people join. The host starts the game.
3. Each player begins with $5,000 virtual cash. The auctioneer opens a storage unit. The unit determines the item count, whether one item is face-up, and whether peeking is before or after buy-in.
4. Players decide in order whether to pay the $100 buy-in. The auctioneer receives those buy-ins.
5. The first active bidder opens at $100. On each turn, an active player raises by at least $100 or passes. The highest bidder wins the unit.
6. The winner pays the auctioneer and adds the haul to their private stash. Original event cards apply their listed effects.
7. If the high bidder cannot pay, they owe a $1,000 in-game fine. The same auction restarts without that player. If they cannot pay the fine, they are eliminated.
8. The schedule gives each player the auctioneer role twice. The champion is the remaining player with the highest cash plus item value.

## Notes and limitations

- The room host's browser is the game referee. It validates queued player actions and writes the shared game state. Keep the host connected during play; if the host closes the tab, the room will stop advancing until that same host reconnects.
- This is a friend-group prototype. It uses browser-side host authority rather than a trusted server/Cloud Function, so a technically skilled host could alter their own game. Do not use it for paid tournaments or valuable prizes.
- Bids and buy-ins are cash-only in this prototype. The printed game's optional use of item value as collateral is not implemented.
- A room is intended for one play session. Old room data is not automatically deleted; use the Firebase console to remove test rooms from the Realtime Database when you are finished.
- Firebase's Spark limits and Vercel Hobby terms can change. Confirm current limits in their official docs before inviting a large group.

## Reference

Gameplay structure is adapted from the public Bidder Battle quick-start manual. This project does not include the official game's card artwork or reproduce its item deck.

- https://runninginnovation.com/
- https://runninginnovation.com/BidderBattle_Manual.pdf
