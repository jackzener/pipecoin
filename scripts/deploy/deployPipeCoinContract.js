require("dotenv").config();
const hre = require("hardhat");

async function main() {
  // Load private key from .env
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env file");
  }

  const provider = hre.ethers.provider;
  const wallet = new hre.ethers.Wallet(privateKey, provider);

  const PipeCoin = await hre.ethers.getContractFactory("PipeCoin", wallet);

  const TOKEN_NAME = "PipeCoin";
  const TOKEN_SYMBOL = "PIPE";
  
  const TREASURY_ADDRESS = wallet.address; // Using deployer as treasury for testing
  
  console.log("Deploying PipeCoin with the following parameters:");
  console.log("  Token Name:", TOKEN_NAME);
  console.log("  Token Symbol:", TOKEN_SYMBOL);
  console.log("  Treasury Address:", TREASURY_ADDRESS);
  console.log("  Deployer Address:", wallet.address);

  // Deploy the contract
  const pipeCoin = await PipeCoin.deploy(
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TREASURY_ADDRESS
  );

  await pipeCoin.waitForDeployment();
  
  const deployedAddress = await pipeCoin.getAddress();

  console.log("PipeCoin deployed successfully!");
  console.log("Contract address:", deployedAddress);

  // Verify the contract on Blockscout on mainnet
  if (network.name !== "mainnet") {
    console.log("Waiting for block confirmation...");
    
    await pipeCoin.deployTransaction.wait(5);

    console.log("Verifying contract on Etherscan...");
    await hre.run("verify:verify", {
      address: deployedAddress,
      constructorArguments: [
        TOKEN_NAME,
        TOKEN_SYMBOL,
        TREASURY_ADDRESS
      ],
    });
  }

  const totalSupply = await pipeCoin.totalSupply();
  console.log("Total Supply:", hre.ethers.formatEther(totalSupply), "PIPE");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });