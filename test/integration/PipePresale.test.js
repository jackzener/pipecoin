const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PipePresale Integration Tests", function () {
    let pipeCoin;
    let pipePresale;
    let owner;
    let treasury;
    let fundingWallet;
    let buyer1;
    let buyer2;
    let usdc;

    const TOKEN_NAME = "PipeCoin";
    const TOKEN_SYMBOL = "PIPE";
    const USDC_DECIMALS = 6;
    const BLOCKS_PER_PHASE = 325000;

    beforeEach(async function () {
      [owner, treasury, fundingWallet, buyer1, buyer2] = await ethers.getSigners();
  
      const PipeCoin = await ethers.getContractFactory("PipeCoin");
      pipeCoin = await PipeCoin.deploy(TOKEN_NAME, TOKEN_SYMBOL, treasury.address);
      await pipeCoin.waitForDeployment();
  
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      usdc = await MockUSDC.deploy();
      await usdc.waitForDeployment();
  
      const PipePresale = await ethers.getContractFactory("PipePresale");
      pipePresale = await PipePresale.deploy(
          await pipeCoin.getAddress(),
          await usdc.getAddress(),
          fundingWallet.address
      );
      await pipePresale.waitForDeployment();
  
      const presaleAmount = ethers.parseEther("84000000000");
      await pipeCoin.connect(treasury).transfer(await pipePresale.getAddress(), presaleAmount);
  
      // Start presale only if it hasn't already started
      if ((await pipePresale.presaleStartBlock()) === 0) {
          await pipePresale.connect(owner).startPresale();
      }
    });

    describe("Setup", function () {
        it("Should initialize with correct state", async function () {
            expect(await pipePresale.token()).to.equal(await pipeCoin.getAddress());
            expect(await pipePresale.usdc()).to.equal(await usdc.getAddress());
            expect(await pipePresale.fundingWallet()).to.equal(fundingWallet.address);
            expect(await pipePresale.owner()).to.equal(owner.address);
            expect(await pipePresale.presaleStartBlock()).to.equal(0);
            expect(await pipePresale.totalTokensSold()).to.equal(0);
            expect(await pipePresale.currentPhaseId()).to.equal(0);
            expect(await pipePresale.presaleEnded()).to.equal(false);
            expect(await pipePresale.claimingEnabled()).to.equal(false);
        });

        it("Should initialize phases correctly", async function () {
            const phase0 = await pipePresale.getPhaseInfo(0);
            expect(phase0[0]).to.equal(98146121360000n); // price
            expect(phase0[1]).to.equal(ethers.parseEther("25200000000")); // cap
            expect(phase0[2]).to.equal(0); // tokensSold
        });
    });

    describe("Presale Flow", function () {
        beforeEach(async function () {
            await pipePresale.connect(owner).startPresale();
        });

        it("Should store IP purchases correctly", async function () {
            const price = (await pipePresale.getPhaseInfo(0))[0];
            const tokenAmount = ethers.parseEther("1000");
            const ipRequired = (tokenAmount * price) / ethers.parseEther("1");

            const initialBalance = await ethers.provider.getBalance(fundingWallet.address);

            await pipePresale.connect(buyer1).buyTokens({ value: ipRequired });

            // Check stored purchase amount with tolerance for rounding
            const claimableAmount = await pipePresale.getClaimableAmount(buyer1.address);
            const difference = tokenAmount - claimableAmount;
            // Allow for 0.01% difference
            expect(difference).to.be.lessThan(tokenAmount / BigInt(10000));
            
            // Check IP transfer
            expect(await ethers.provider.getBalance(fundingWallet.address))
                .to.equal(initialBalance + ipRequired);
        });

        it("Should store USDC purchases correctly", async function () {
            const price = (await pipePresale.getPhaseInfo(0))[0];
            const tokenAmount = ethers.parseUnits("1000");
            
            // Calculate USDC amount according to contract's formula
            const usdcAmount = (tokenAmount * price) / BigInt(10 ** 18);

            await usdc.mint(buyer1.address, usdcAmount);
            await usdc.connect(buyer1).approve(await pipePresale.getAddress(), usdcAmount);

            const initialUsdcBalance = await usdc.balanceOf(fundingWallet.address);
            const initialBuyer1UsdcBalance = await usdc.balanceOf(buyer1.address);

            await pipePresale.connect(buyer1).buyTokensWithUSDC(usdcAmount);

            // Check stored purchase amount
            expect(await pipePresale.getClaimableAmount(buyer1.address)).to.equal(tokenAmount);

            // Check USDC transfer
            expect(await usdc.balanceOf(fundingWallet.address))
                .to.equal(initialUsdcBalance + usdcAmount);
            expect(await usdc.balanceOf(buyer1.address))
                .to.equal(initialBuyer1UsdcBalance - usdcAmount);
        });

        it("Should calculate tokens correctly from USDC amount", async function () {
            const price = (await pipePresale.getPhaseInfo(0))[0];
            const usdcAmount = ethers.parseUnits("1000", 6); // USDC has 6 decimals
            
            // Calculate token amount according to contract's formula
            const tokenAmount = (usdcAmount * BigInt(10 ** 18)) / price;
        
            await usdc.mint(buyer1.address, usdcAmount);
            await usdc.connect(buyer1).approve(await pipePresale.getAddress(), usdcAmount);
        
            const initialUsdcBalance = await usdc.balanceOf(fundingWallet.address);
            const initialBuyer1UsdcBalance = await usdc.balanceOf(buyer1.address);
        
            await pipePresale.connect(buyer1).buyTokensWithUSDC(usdcAmount);
            
            // Check stored purchase amount
            expect(await pipePresale.getClaimableAmount(buyer1.address)).to.equal(tokenAmount);
        
            // Check USDC transfer
            expect(await usdc.balanceOf(fundingWallet.address))
                .to.equal(initialUsdcBalance + usdcAmount);
            expect(await usdc.balanceOf(buyer1.address))
                .to.equal(initialBuyer1UsdcBalance - usdcAmount);
        });

        it("Should store multiple purchases correctly", async function () {
            const phase0 = await pipePresale.getPhaseInfo(0);
            const tokenAmount = ethers.parseEther("1000");
            const ipRequired = (tokenAmount * phase0[0]) / ethers.parseEther("1");

            // Make multiple purchases
            await pipePresale.connect(buyer1).buyTokens({ value: ipRequired });
            await pipePresale.connect(buyer1).buyTokens({ value: ipRequired });

            // Check cumulative stored amount
            expect(await pipePresale.getClaimableAmount(buyer1.address))
                .to.equal(tokenAmount * BigInt(2));
        });

        it("Should handle phase transitions correctly", async function () {
            const phase0 = await pipePresale.getPhaseInfo(0);
            const tokenAmount = phase0[1]; // Buy all tokens in phase 0
            const ipRequired = (tokenAmount * phase0[0]) / ethers.parseEther("1");

            await pipePresale.connect(buyer1).buyTokens({ value: ipRequired });

            expect(await pipePresale.currentPhaseId()).to.equal(1);

            // Check stored purchase amount
            expect(await pipePresale.getClaimableAmount(buyer1.address)).to.equal(tokenAmount);
        });
    });

    describe("Claiming", function () {
        beforeEach(async function () {
            await pipePresale.connect(owner).startPresale();

            // Make a purchase
            const phase0 = await pipePresale.getPhaseInfo(0);
            const tokenAmount = ethers.parseEther("1000");
            const ipRequired = (tokenAmount * phase0[0]) / ethers.parseEther("1");
            await pipePresale.connect(buyer1).buyTokens({ value: ipRequired });
        });

        it("Should not allow claiming before enabled", async function () {
            await expect(pipePresale.connect(buyer1).claim())
                .to.be.revertedWithCustomError(pipePresale, "ClaimingNotEnabled");
        });

        it("Should not allow enabling claims before presale ends", async function () {
            await expect(pipePresale.connect(owner).enableClaiming())
                .to.be.revertedWithCustomError(pipePresale, "PresaleNotEnded");
        });

        it("Should allow claiming after presale ends", async function () {
            // End presale by time
            const blocksToMine = BLOCKS_PER_PHASE * 8 + 1;
            await ethers.provider.send("hardhat_mine", [
                ethers.toQuantity(blocksToMine)
            ]);

            await pipePresale.connect(owner).enableClaiming();

            const claimableAmount = await pipePresale.getClaimableAmount(buyer1.address);
            const initialBalance = await pipeCoin.balanceOf(buyer1.address);

            await pipePresale.connect(buyer1).claim();

            expect(await pipeCoin.balanceOf(buyer1.address))
                .to.equal(initialBalance + claimableAmount);
        });

        it("Should not allow claiming twice", async function () {
            // End presale and enable claiming
            const blocksToMine = BLOCKS_PER_PHASE * 8 + 1;
            await ethers.provider.send("hardhat_mine", [
                ethers.toQuantity(blocksToMine)
            ]);

            await pipePresale.connect(owner).enableClaiming();
            await pipePresale.connect(buyer1).claim();

            await expect(pipePresale.connect(buyer1).claim())
                .to.be.revertedWithCustomError(pipePresale, "AlreadyClaimed");
        });
    });

    describe("Admin Functions", function () {
        beforeEach(async function () {
            await pipePresale.connect(owner).startPresale();
        });
        it("Should allow owner to update funding wallet", async function () {
            await pipePresale.connect(owner).setFundingWallet(buyer2.address);
            expect(await pipePresale.fundingWallet()).to.equal(buyer2.address);
        });

        it("Should allow owner to update final price", async function () {
            const newPrice = 200000000;
            await pipePresale.connect(owner).setFinalPrice(newPrice);
            expect(await pipePresale.finalPrice()).to.equal(newPrice);
        });

        it("Should allow owner to recover unsold tokens after presale ends", async function () {
            // End presale by time
            const blocksToMine = BLOCKS_PER_PHASE * 8 + 1;
            await ethers.provider.send("hardhat_mine", [
                ethers.toQuantity(blocksToMine)
            ]);
            const presaleBalance = await pipeCoin.balanceOf(await pipePresale.getAddress());
            await pipePresale.connect(owner).recoverTokens();
            
            expect(await pipeCoin.balanceOf(owner.address)).to.equal(presaleBalance);
        });
    });

    describe("Error Cases", function () {
        beforeEach(async function () {
            await pipePresale.connect(owner).startPresale();
        });

        it("Should revert when buying with insufficient USDC allowance", async function () {
            const phase0 = await pipePresale.getPhaseInfo(0);
            const tokenAmount = ethers.parseEther("1000");
            const scaleFactor = BigInt(10 ** (18 - USDC_DECIMALS));
            const usdcAmount = (tokenAmount * phase0[0] * scaleFactor) / BigInt(10 ** 18);
            
            await expect(pipePresale.connect(buyer1).buyTokensWithUSDC(usdcAmount))
                .to.be.revertedWithCustomError(pipePresale, "InsufficientAllowance");
        });

        it("Should revert when presale not started", async function () {
            const newPresale = await (await ethers.getContractFactory("PipePresale"))
                .deploy(await pipeCoin.getAddress(), await usdc.getAddress(), fundingWallet.address);
            
            await expect(newPresale.connect(buyer1).buyTokens({ value: ethers.parseEther("1") }))
                .to.be.revertedWithCustomError(newPresale, "PresaleNotStarted");
        });

        it("Should revert claim with no purchases", async function () {
            // End presale and enable claiming
            const blocksToMine = BLOCKS_PER_PHASE * 8 + 1;
            await ethers.provider.send("hardhat_mine", [
                ethers.toQuantity(blocksToMine)
            ]);

            await pipePresale.connect(owner).enableClaiming();

            await expect(pipePresale.connect(buyer2).claim())
                .to.be.revertedWithCustomError(pipePresale, "NothingToClaim");
        });

        it("Should revert non-owner admin functions", async function () {
            await expect(pipePresale.connect(buyer1).setFundingWallet(buyer2.address))
                .to.be.reverted;

            await expect(pipePresale.connect(buyer1).setFinalPrice(100000000))
                .to.be.reverted;

            await expect(pipePresale.connect(buyer1).enableClaiming())
                .to.be.reverted;

            await expect(pipePresale.connect(buyer1).recoverTokens())
                .to.be.reverted;
        });
    });

    describe("Pause Functionality Integration", function () {
        beforeEach(async function () {
            // Deploy fresh contracts for each test
            [owner, treasury, fundingWallet, buyer1, buyer2] = await ethers.getSigners();
    
            const PipeCoin = await ethers.getContractFactory("PipeCoin");
            pipeCoin = await PipeCoin.deploy(TOKEN_NAME, TOKEN_SYMBOL, treasury.address);
            await pipeCoin.waitForDeployment();
    
            const MockUSDC = await ethers.getContractFactory("MockUSDC");
            usdc = await MockUSDC.deploy();
            await usdc.waitForDeployment();
    
            const PipePresale = await ethers.getContractFactory("PipePresale");
            pipePresale = await PipePresale.deploy(
                await pipeCoin.getAddress(),
                await usdc.getAddress(),
                fundingWallet.address
            );
            await pipePresale.waitForDeployment();
    
            const presaleAmount = ethers.parseEther("84000000000");
            await pipeCoin.connect(treasury).transfer(await pipePresale.getAddress(), presaleAmount);
        });
    
        it("Should integrate pause with full presale flow", async function () {
            // Start presale
            await pipePresale.connect(owner).startPresale();
    
            // Set up buyer with USDC
            const usdcAmount = ethers.parseUnits("1000", 6);
            await usdc.mint(buyer1.address, usdcAmount);
            await usdc.connect(buyer1).approve(await pipePresale.getAddress(), usdcAmount);
    
            // Make initial purchase
            const initialPurchase = ethers.parseUnits("500", 6);
            await pipePresale.connect(buyer1).buyTokensWithUSDC(initialPurchase);
            const firstPurchaseAmount = await pipePresale.getClaimableAmount(buyer1.address);
    
            // Pause the contract
            await pipePresale.connect(owner).pause();
            expect(await pipePresale.paused()).to.be.true;
    
            // Verify all purchasing functions are blocked
            const phase0 = await pipePresale.getPhaseInfo(0);
            const tokenAmount = ethers.parseEther("1000");
            const ipRequired = (tokenAmount * phase0[0]) / ethers.parseEther("1");
    
            await expect(pipePresale.connect(buyer1).buyTokens({ value: ipRequired }))
                .to.be.revertedWithCustomError(pipePresale, "PresaleIsPaused");
    
            await expect(pipePresale.connect(buyer1).buyTokensWithUSDC(initialPurchase))
                .to.be.revertedWithCustomError(pipePresale, "PresaleIsPaused");
    
            // Unpause and verify operations resume
            await pipePresale.connect(owner).unpause();
            expect(await pipePresale.paused()).to.be.false;
    
            // Make another purchase after unpausing
            await pipePresale.connect(buyer1).buyTokensWithUSDC(initialPurchase);
            const totalPurchaseAmount = await pipePresale.getClaimableAmount(buyer1.address);
            expect(totalPurchaseAmount).to.be.gt(firstPurchaseAmount);
    
            // End presale and test claiming with pause
            const blocksToMine = BLOCKS_PER_PHASE * 8 + 1;
            await ethers.provider.send("hardhat_mine", [ethers.toQuantity(blocksToMine)]);
            await pipePresale.connect(owner).enableClaiming();
    
            // Pause and verify claiming is blocked
            await pipePresale.connect(owner).pause();
            await expect(pipePresale.connect(buyer1).claim())
                .to.be.revertedWithCustomError(pipePresale, "PresaleIsPaused");
    
            // Unpause and verify successful claim
            await pipePresale.connect(owner).unpause();
            await pipePresale.connect(buyer1).claim();
            expect(await pipeCoin.balanceOf(buyer1.address)).to.equal(totalPurchaseAmount);
        });
    
        it("Should maintain purchase state through pause/unpause cycles", async function () {
            await pipePresale.connect(owner).startPresale();
    
            // Make initial purchase
            const phase0 = await pipePresale.getPhaseInfo(0);
            const tokenAmount = ethers.parseEther("1000");
            const ipRequired = (tokenAmount * phase0[0]) / ethers.parseEther("1");
            await pipePresale.connect(buyer1).buyTokens({ value: ipRequired });
    
            const initialPurchaseAmount = await pipePresale.getClaimableAmount(buyer1.address);
    
            // Pause and unpause multiple times
            await pipePresale.connect(owner).pause();
            await pipePresale.connect(owner).unpause();
            await pipePresale.connect(owner).pause();
            await pipePresale.connect(owner).unpause();
    
            // Verify purchase amount remains unchanged
            expect(await pipePresale.getClaimableAmount(buyer1.address))
                .to.equal(initialPurchaseAmount);
        });
    
        it("Should handle pause during phase transitions", async function () {
            await pipePresale.connect(owner).startPresale();
    
            // Buy almost all tokens in phase 0
            const phase0 = await pipePresale.getPhaseInfo(0);
            const almostAllTokens = phase0[1] - ethers.parseEther("1000"); // Leave some tokens
            const ipRequired = (almostAllTokens * phase0[0]) / ethers.parseEther("1");
            
            await pipePresale.connect(buyer1).buyTokens({ value: ipRequired });
            const currentPhase = await pipePresale.currentPhaseId();
    
            // Pause the contract
            await pipePresale.connect(owner).pause();
    
            // Try to buy remaining tokens
            const remainingTokens = ethers.parseEther("1000");
            const remainingPayment = (remainingTokens * phase0[0]) / ethers.parseEther("1");
            
            await expect(pipePresale.connect(buyer1).buyTokens({ value: remainingPayment }))
                .to.be.revertedWithCustomError(pipePresale, "PresaleIsPaused");
    
            // Unpause and complete phase
            await pipePresale.connect(owner).unpause();
            await pipePresale.connect(buyer1).buyTokens({ value: remainingPayment });
    
            // Verify phase advanced
            expect(await pipePresale.currentPhaseId()).to.be.gt(currentPhase);
        });
    
        it("Should handle pausing with multiple participants", async function () {
            await pipePresale.connect(owner).startPresale();
    
            // Setup USDC for both buyers
            const usdcAmount = ethers.parseUnits("1000", 6);
            await usdc.mint(buyer1.address, usdcAmount);
            await usdc.mint(buyer2.address, usdcAmount);
            await usdc.connect(buyer1).approve(await pipePresale.getAddress(), usdcAmount);
            await usdc.connect(buyer2).approve(await pipePresale.getAddress(), usdcAmount);
    
            // Buyer 1 purchases before pause
            const initialPurchase = ethers.parseUnits("500", 6);
            await pipePresale.connect(buyer1).buyTokensWithUSDC(initialPurchase);
            const buyer1Amount = await pipePresale.getClaimableAmount(buyer1.address);
    
            // Pause contract
            await pipePresale.connect(owner).pause();
    
            // Buyer 2 attempts purchase during pause
            await expect(pipePresale.connect(buyer2).buyTokensWithUSDC(initialPurchase))
                .to.be.revertedWithCustomError(pipePresale, "PresaleIsPaused");
    
            // Unpause and let buyer 2 purchase
            await pipePresale.connect(owner).unpause();
            await pipePresale.connect(buyer2).buyTokensWithUSDC(initialPurchase);
    
            // Verify both purchases were processed correctly
            expect(await pipePresale.getClaimableAmount(buyer1.address)).to.equal(buyer1Amount);
            expect(await pipePresale.getClaimableAmount(buyer2.address)).to.be.gt(0);
        });
    });
});