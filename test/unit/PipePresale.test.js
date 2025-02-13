const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("TokenPresale", function () {
  async function deployPresaleFixture() {
    const [owner, fundingWallet, treasury, buyer1, buyer2] = await ethers.getSigners();
    
    // Deploy PipeCoin
    const PipeCoin = await ethers.getContractFactory("PipeCoin");
    const token = await PipeCoin.deploy(
      "PipeCoin",
      "PIPE",
      treasury.address
    );

    // Deploy mock USDC for testing
    const MockToken = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockToken.deploy();
    
    // Deploy TokenPresale contract
    const TokenPresale = await ethers.getContractFactory("PipePresale");
    const presale = await TokenPresale.deploy(
      await token.getAddress(),
      await usdc.getAddress(),
      fundingWallet.address
    );
    
    const presaleAmount = ethers.parseEther("84000000000");
    await token.connect(treasury).transfer(await presale.getAddress(), presaleAmount);

    // Mint some USDC
    await usdc.mint(buyer1.address, ethers.parseUnits("10000", 6))
    await usdc.mint(buyer2.address, ethers.parseUnits("10000", 6))
    
    return { 
      presale, 
      token, 
      usdc, 
      owner, 
      fundingWallet, 
      treasury, 
      buyer1, 
      buyer2,
      presaleAmount
    };
  }

  describe("Deployment", function () {
    // ... [Previous deployment tests remain the same] ...
  });

  describe("Presale Management", function () {
    // ... [Previous presale management tests remain the same] ...
  });

  describe("Token Purchases", function () {
    it("Should store purchase information correctly for IP payment", async function () {
      const { presale, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      
      const claimableAmount = await presale.getClaimableAmount(buyer1.address);
      expect(claimableAmount).to.equal(tokenAmount);
    });

    it("Should store purchase information correctly for USDC payment", async function () {
      const { presale, usdc, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      const usdcAmount = ethers.parseUnits("1000", 6);
      await usdc.connect(buyer1).approve(await presale.getAddress(), usdcAmount);
      
      await presale.connect(buyer1).buyTokensWithUSDC(usdcAmount);
      
      const claimableAmount = await presale.getClaimableAmount(buyer1.address);
      expect(claimableAmount).to.be.gt(0);
    });

    it("Should accumulate multiple purchases correctly", async function () {
      const { presale, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      // Make two purchases
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      
      const claimableAmount = await presale.getClaimableAmount(buyer1.address);
      expect(claimableAmount).to.equal(tokenAmount * BigInt(2));
    });
    
    // ... [Previous token purchase tests without token transfer checks] ...
  });

  describe("Claiming", function () {
    it("Should not allow claiming before it's enabled", async function () {
      const { presale, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      
      await expect(presale.connect(buyer1).claim())
        .to.be.revertedWithCustomError(presale, "ClaimingNotEnabled");
    });

    it("Should not allow enabling claims before presale ends", async function () {
      const { presale, owner } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      await expect(presale.connect(owner).enableClaiming())
        .to.be.revertedWithCustomError(presale, "PresaleNotEnded");
    });

    it("Should allow claiming after presale ends and claiming is enabled", async function () {
      const { presale, token, buyer1, owner } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      
      // End presale by advancing blocks
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(325000 * 8)]);
      
      await presale.connect(owner).enableClaiming();
      
      const initialBalance = await token.balanceOf(buyer1.address);
      await presale.connect(buyer1).claim();
      
      expect(await token.balanceOf(buyer1.address))
        .to.equal(initialBalance + tokenAmount);
    });

    it("Should not allow claiming twice", async function () {
      const { presale, buyer1, owner } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      
      // End presale and enable claiming
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(325000 * 8)]);
      await presale.connect(owner).enableClaiming();
      
      // First claim should succeed
      await presale.connect(buyer1).claim();
      
      // Second claim should fail
      await expect(presale.connect(buyer1).claim())
        .to.be.revertedWithCustomError(presale, "AlreadyClaimed");
    });

    it("Should not allow claiming with no purchases", async function () {
      const { presale, buyer1, owner } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      // End presale and enable claiming
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(325000 * 8)]);
      await presale.connect(owner).enableClaiming();
      
      await expect(presale.connect(buyer1).claim())
        .to.be.revertedWithCustomError(presale, "NothingToClaim");
    });
  });

  describe("View Functions", function () {
    it("Should return correct claimable amount", async function () {
      const { presale, buyer1, owner } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      
      // Initial check
      expect(await presale.getClaimableAmount(buyer1.address)).to.equal(0);
      
      // Make a purchase
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      
      // Check after purchase
      expect(await presale.getClaimableAmount(buyer1.address)).to.equal(tokenAmount);
      
      // End presale, enable claiming and claim
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(325000 * 8)]);
      await presale.connect(owner).enableClaiming();
      await presale.connect(buyer1).claim();
      
      // Check after claiming
      expect(await presale.getClaimableAmount(buyer1.address)).to.equal(0);
    });
    
    // ... [Previous view function tests remain the same] ...
  });

  describe("Pause Functionality", function () {
    it("Should allow owner to pause the contract", async function () {
      const { presale, owner } = await loadFixture(deployPresaleFixture);
      
      await presale.connect(owner).pause();
      expect(await presale.paused()).to.be.true;
      
      // Verify event emission
      await expect(presale.connect(owner).pause())
        .to.emit(presale, "PresalePaused")
        .withArgs(owner.address);
    });

    it("Should allow owner to unpause the contract", async function () {
      const { presale, owner } = await loadFixture(deployPresaleFixture);
      
      // First pause
      await presale.connect(owner).pause();
      expect(await presale.paused()).to.be.true;
      
      // Then unpause
      await presale.connect(owner).unpause();
      expect(await presale.paused()).to.be.false;
      
      // Verify event emission
      await expect(presale.connect(owner).unpause())
        .to.emit(presale, "PresaleUnpaused")
        .withArgs(owner.address);
    });

    it("Should not allow non-owner to pause", async function () {
      const { presale, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await expect(presale.connect(buyer1).pause())
        .to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });

    it("Should not allow non-owner to unpause", async function () {
      const { presale, owner, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await presale.connect(owner).pause();
      await expect(presale.connect(buyer1).unpause())
        .to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });

    it("Should prevent starting presale when paused", async function () {
      const { presale, owner } = await loadFixture(deployPresaleFixture);
      
      await presale.connect(owner).pause();
      await expect(presale.startPresale())
        .to.be.revertedWithCustomError(presale, "PresaleIsPaused");
    });

    it("Should prevent buying tokens with ETH when paused", async function () {
      const { presale, owner, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      await presale.connect(owner).pause();
      
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      await expect(presale.connect(buyer1).buyTokens({ value: paymentAmount }))
        .to.be.revertedWithCustomError(presale, "PresaleIsPaused");
    });

    it("Should prevent buying tokens with USDC when paused", async function () {
      const { presale, usdc, owner, buyer1 } = await loadFixture(deployPresaleFixture);
      
      await presale.startPresale();
      await presale.connect(owner).pause();
      
      const usdcAmount = ethers.parseUnits("1000", 6);
      await usdc.connect(buyer1).approve(await presale.getAddress(), usdcAmount);
      
      await expect(presale.connect(buyer1).buyTokensWithUSDC(usdcAmount))
        .to.be.revertedWithCustomError(presale, "PresaleIsPaused");
    });

    it("Should prevent claiming when paused", async function () {
      const { presale, owner, buyer1 } = await loadFixture(deployPresaleFixture);
      
      // Setup: Start presale and make a purchase
      await presale.startPresale();
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      await presale.connect(buyer1).buyTokens({ value: paymentAmount });
      
      // End presale and enable claiming
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(325000 * 8)]);
      await presale.connect(owner).enableClaiming();
      
      // Pause contract and try to claim
      await presale.connect(owner).pause();
      await expect(presale.connect(buyer1).claim())
        .to.be.revertedWithCustomError(presale, "PresaleIsPaused");
    });

    it("Should allow normal operation after unpausing", async function () {
      const { presale, owner, buyer1 } = await loadFixture(deployPresaleFixture);
      
      // Pause and then unpause
      await presale.connect(owner).pause();
      await presale.connect(owner).unpause();
      
      // Try normal operations
      await presale.startPresale();
      
      const phase0 = await presale.getPhaseInfo(0);
      const tokenAmount = ethers.parseEther("1000");
      const paymentAmount = (tokenAmount * phase0[0]) / BigInt(10**18);
      
      await expect(presale.connect(buyer1).buyTokens({ value: paymentAmount }))
        .to.not.be.reverted;
    });
  });
});