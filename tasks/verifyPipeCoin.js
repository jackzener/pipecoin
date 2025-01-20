const { task } = require("hardhat/config");

// Register a custom task for contract verification
task("verify-contract", "Verifies a contract on Etherscan")
  .addPositionalParam("address", "The deployed contract address")
  .addVariadicPositionalParam(
    "constructorArgs",
    "The arguments for the contract constructor"
  )
  .setAction(async ({ address, constructorArgs }, hre) => {
    console.log(`Verifying contract at ${address}...`);
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: constructorArgs,
      });
      console.log("Contract verified successfully!");
    } catch (error) {
      console.error("Verification failed:", error.message);
    }
  });

module.exports = {};