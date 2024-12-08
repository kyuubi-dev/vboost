import RaydiumSwap from './RaydiumSwap';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import 'dotenv/config';
import { swapConfig } from './swapConfig';
import axios from 'axios';

// Helper function to pause execution for a specified amount of milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetches the price of a specific token in SOL
const fetchTokenPriceInSol = async (tokenAddress: string): Promise<number> => {
  let priceInSol = 0;

  while (priceInSol === 0) {
    try {
      // Fetch token price data from Dexscreener
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const tokenData = response.data;

      // Extract token price in USD
      const priceUsd = tokenData.pairs[0]?.priceUsd;

      if (priceUsd) {
        // Fetch the current price of SOL in USD (should be dynamically fetched)
        const solPrice = 236;

        // Convert token price from USD to SOL
        const solPriceInToken = parseFloat(priceUsd) / solPrice;
        priceInSol = solPriceInToken; // Token price in SOL
        return priceInSol;
      } else {
        console.error('Token price not found');
        return 0;
      }
    } catch (error) {
      console.error('Error fetching token price from Dexscreener:', error);
      console.log('Retrying in 10 seconds...');
      await sleep(10000); // Wait for 10 seconds before retrying
    }
  }
};

// Main function to perform token swaps
const swap = async () => {
  // Initialize RaydiumSwap with the first private key
  const raydiumSwap = new RaydiumSwap(process.env.RPC_URL, process.env.WALLET_PRIVATE_KEY1);
  console.log(`Raydium swap initialized`);

  // List of private keys for accounts
  const privateKeys = [
    process.env.WALLET_PRIVATE_KEY
  ];

  // Fetch the initial price of the token in SOL
  let tokenPriceInSol = await fetchTokenPriceInSol(swapConfig.tokenBAddress);

  for (let i = 0; i < 1000; i++) {
    // Select a random private key for the current transaction
    const randomIndex = Math.floor(Math.random() * privateKeys.length);
    const currentPrivateKey = privateKeys[randomIndex];
    const currentRaydiumSwap = new RaydiumSwap(process.env.RPC_URL, currentPrivateKey);

    // Calculate a randomized amount for the first token swap
    const randomFactor = 1 + (Math.random() * 0.6 - 0.3); 
    const randomizedTokenAAmountFirst = swapConfig.tokenAAmount * randomFactor;

    // Log and perform the first token swap
    console.log(`---------${i}---------\nSwapping ${randomizedTokenAAmountFirst} of ${swapConfig.tokenAAddress} for ${swapConfig.tokenBAddress}`);
    const boughtAmount = await performSwap(currentRaydiumSwap, swapConfig.tokenAAddress, swapConfig.tokenBAddress, randomizedTokenAAmountFirst, swapConfig);

    await sleep(5000);

    // Calculate a randomized amount for the second token swap
    const randomFactorSecond = 1 + (Math.random() * 0.55 - 0.29);
    const randomizedTokenAAmountSecond = swapConfig.tokenAAmount * randomFactorSecond;

    // Log and perform the second token swap
    console.log(`Swapping ${randomizedTokenAAmountSecond} of ${swapConfig.tokenAAddress} for ${swapConfig.tokenBAddress}`);
    await performSwap(currentRaydiumSwap, swapConfig.tokenAAddress, swapConfig.tokenBAddress, randomizedTokenAAmountSecond, swapConfig);

    await sleep(5000);

    // Refresh token price every 5 iterations
    if ((i + 1) % 5 === 0) {
      tokenPriceInSol = await fetchTokenPriceInSol(swapConfig.tokenBAddress);
      console.log(`Updated token price: ${tokenPriceInSol}`);
    }

    // Calculate the amount to sell back into the original token
    const amountToSell = (boughtAmount / tokenPriceInSol) * 1.9;

    // Log and perform the sell transaction
    console.log(`Selling ${amountToSell} of ${swapConfig.tokenBAddress} for ${swapConfig.tokenAAddress}...`);
    await performSwap(currentRaydiumSwap, swapConfig.tokenBAddress, swapConfig.tokenAAddress, amountToSell, swapConfig);

    await sleep(5000);
  }
};

// Function to perform a single swap operation
const performSwap = async (raydiumSwap: RaydiumSwap, fromToken: string, toToken: string, amount: number, config: any): Promise<number> => {
  // Load pool data for token swapping
  await raydiumSwap.loadPoolKeys(config.liquidityFile);

  // Find the pool information for the token pair
  const poolInfo = raydiumSwap.findPoolInfoForTokens(fromToken, toToken);
  if (!poolInfo) {
    return 0;
  }

  let success = false;
  let txid: string = '';
  while (!success) {
    try {
      // Generate a transaction for swapping tokens
      const tx = await raydiumSwap.getSwapTransaction(
        toToken,
        amount,
        poolInfo,
        config.maxLamports,
        config.useVersionedTransaction,
        config.direction
      );

      if (config.executeSwap) {
        // Send the transaction
        txid = config.useVersionedTransaction
          ? await raydiumSwap.sendVersionedTransaction(tx as VersionedTransaction, config.maxRetries)
          : await raydiumSwap.sendLegacyTransaction(tx as Transaction, config.maxRetries);

        console.log(`Transaction successful: https://solscan.io/tx/${txid}\n`);
        success = true;
      } else {
        // Simulate the transaction if execution is disabled
        const simRes = config.useVersionedTransaction
          ? await raydiumSwap.simulateVersionedTransaction(tx as VersionedTransaction)
          : await raydiumSwap.simulateLegacyTransaction(tx as Transaction);

        success = true;
      }
    } catch (error) {
      if (error.code === 'RPC_ERROR') {
        console.error('RPC error: operation failed, retrying in 5 seconds...');
        await sleep(5000);
      } else {
        console.error('Unknown error during operation:', error);
        break;
      }
    }
  }

  return amount;
};

// Start the swapping process
swap();
