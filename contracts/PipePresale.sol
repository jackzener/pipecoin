// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

contract PipePresale is ReentrancyGuard, Ownable, AccessControl {
    using Address for address payable;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    IERC20 public immutable token;
    IERC20 public immutable usdcToken;
    IERC20Permit public immutable usdcPermit;
    address public fundingWallet;
    
    uint256 public constant TOTAL_SUPPLY = 84_000_000_000 * 10**18;
    uint256 public constant TOTAL_PHASES = 8;
    uint256 public constant USDC_DECIMALS = 6;
    uint256 public ipTokenPrice;  // Price in wei
    
    struct Phase {
        uint256 price;
        uint256 cap;
        uint256 tokensSold;
    }

    struct Purchase {
        uint256[] amount;
        bool claimed;
    }
    
    mapping(uint256 => Phase) public phases;
    mapping(address => Purchase) purchases;
    mapping(uint256 => uint256) public phaseChangeTimestamps;
    
    uint256 public finalPrice = 119070421200000;
    uint256 public presaleStartBlock;
    uint256 public totalTokensSold;
    uint256 public currentPhaseId;
    bool public presaleEnded;
    bool public claimingEnabled;
    bool public paused;
    
    mapping(address => uint256) public tokensPurchased;
    
    event TokensPurchased(
        address indexed buyer, 
        uint256 amount, 
        uint256 price, 
        uint256 phase, 
        bool isUsdcPayment
    );
    
    event PresaleStarted(uint256 startBlock);
    event PresaleEnded(uint256 endBlock);
    event PhaseAdvanced(uint256 newPhase, uint256 blockNumber);
    event FinalPriceUpdated(uint256 newPrice);
    event PhaseCompleted(uint256 phase, uint256 blockNumber);
    event FundingWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event FundsForwarded(address indexed to, uint256 amount, bool isUsdcPayment);
    event TokensClaimed(address indexed user, uint256 amount);
    event PresalePaused(address indexed by);
    event PresaleUnpaused(address indexed by);
    event IpTokenPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event PhaseManuallyAdvanced(uint256 oldPhase, uint256 newPhase, uint256 timestamp);
    event PhaseTimestampUpdated(uint256 phase, uint256 timestamp);

    error InvalidAddress();
    error InvalidPrice();
    error PresaleNotStarted();
    error PresaleAlreadyStarted();
    error PresaleHasEnded();
    error InvalidAmount();
    error InsufficientPayment();
    error MaxSupplyExceeded();
    error TransferFailed();
    error InvalidPhase();
    error PreviousPhaseNotCompleted();
    error TokenRecoveryFailed();
    error ForwardingFailed();
    error InsufficientAllowance();
    error PresaleNotEnded();
    error NothingToClaim();
    error AlreadyClaimed();
    error ClaimingNotEnabled();
    error PresaleIsPaused();
    error PhaseNotCompleted();
    error InvalidPhaseProgression();

    modifier whenNotPaused() {
        if (paused) revert PresaleIsPaused();
        _;
    }

    constructor(
        address _token, 
        address _usdc,
        address _fundingWallet,
        address _admin1,
        address _admin2
    ) Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        
        if (_admin1 != address(0)) {
            _grantRole(ADMIN_ROLE, _admin1);
            _grantRole(DEFAULT_ADMIN_ROLE, _admin1);
        }
        if (_admin2 != address(0)) {
            _grantRole(ADMIN_ROLE, _admin2);
            _grantRole(DEFAULT_ADMIN_ROLE, _admin2);
        }
        
        if (_token == address(0) || _fundingWallet == address(0) || _usdc == address(0)) 
            revert InvalidAddress();
            
        token = IERC20(_token);
        usdcToken = IERC20(_usdc);
        usdcPermit = IERC20Permit(_usdc);
        fundingWallet = _fundingWallet;
        presaleEnded = false;
        paused = false;
        
        _initializePhases();
    }

    function buyTokensWithUSDCPermit(
        uint256 usdcAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused {
        if (usdcAmount == 0) revert InvalidAmount();
        
        // Execute the permit
        usdcPermit.permit(
            msg.sender,     // owner
            address(this),  // spender
            usdcAmount,     // value
            deadline,       // deadline
            v, r, s        // signature parameters
        );
        
        // Process the token purchase
        _processTokenPurchase(usdcAmount, false);
        
        // Transfer USDC using the just-approved allowance
        if (!usdcToken.transferFrom(msg.sender, fundingWallet, usdcAmount)) revert TransferFailed();
    }

    function pause() external onlyOwner {
        paused = true;
        emit PresalePaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PresaleUnpaused(msg.sender);
    }

    function _initializePhases() private {
        uint256[8] memory prices = [
            uint256(98146121360000),  // 0.00009814612136
            uint256(107960733500000), // 0.0001079607335
            uint256(118756806800000), // 0.0001187568068
            uint256(130632487500000), // 0.0001306324875
            uint256(143695736300000), // 0.0001436957363
            uint256(158065309900000), // 0.0001580653099
            uint256(173871840900000), // 0.0001738718409
            uint256(191259025000000)  // 0.000191259025
        ];
        
        uint256[8] memory caps = [
            uint256(25_200_000_000) * 10**18,
            uint256(21_000_000_000) * 10**18,
            uint256(12_600_000_000) * 10**18,
            uint256(8_400_000_000) * 10**18,
            uint256(6_720_000_000) * 10**18,
            uint256(5_040_000_000) * 10**18,
            uint256(3_360_000_000) * 10**18,
            uint256(1_680_000_000) * 10**18
        ];

        for(uint256 i = 0; i < TOTAL_PHASES; i++) {
            if(prices[i] == 0) revert InvalidPrice();
            phases[i] = Phase({
                price: prices[i],
                cap: caps[i],
                tokensSold: 0
            });
        }
    }

    function setFundingWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert InvalidAddress();
        address oldWallet = fundingWallet;
        fundingWallet = newWallet;
        emit FundingWalletUpdated(oldWallet, newWallet);
    }

    function startPresale() external onlyOwner whenNotPaused {
        if (presaleStartBlock != 0) revert PresaleAlreadyStarted();
        if (ipTokenPrice == 0) revert InvalidPrice();
        presaleEnded = false;
        presaleStartBlock = block.number;
        emit PresaleStarted(presaleStartBlock);
    }

    function advancePhaseManually() external whenNotPaused {
        if (!hasRole(ADMIN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) 
            revert AccessControlUnauthorizedAccount(msg.sender, ADMIN_ROLE);
            
        if (!isPresaleActive()) revert PresaleNotStarted();
        if (presaleEnded) revert PresaleHasEnded();
        if (currentPhaseId >= TOTAL_PHASES - 1) revert InvalidPhaseProgression();
        
        // Removed phase completion check
        
        uint256 oldPhase = currentPhaseId;
        currentPhaseId++;
        
        uint256 timestamp = block.timestamp;
        phaseChangeTimestamps[currentPhaseId] = timestamp;
        
        emit PhaseManuallyAdvanced(oldPhase, currentPhaseId, timestamp);
        emit PhaseAdvanced(currentPhaseId, block.number);
        emit PhaseTimestampUpdated(currentPhaseId, timestamp);
    }

    function buyTokens() external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert InvalidAmount();
        _processTokenPurchase(msg.value, true);
    }

    function _processTokenPurchase(uint256 paymentAmount, bool isNativePayment) private {
        if (!isPresaleActive()) revert PresaleNotStarted();
        if (presaleEnded) revert PresaleHasEnded();
        
        uint256 currentPhase = currentPhaseId;
        uint256 remainingPayment = paymentAmount;
        uint256 totalTokensToReceive = 0;
        uint256 totalPaymentRequired = 0;
        
        while (remainingPayment > 0 && currentPhase < TOTAL_PHASES) {
            uint256 price = phases[currentPhase].price;
            uint256 remainingInPhase = phases[currentPhase].cap - phases[currentPhase].tokensSold;
            
            uint256 tokensAtCurrentPrice;
            if (isNativePayment) {
                tokensAtCurrentPrice = (remainingPayment * 10**18) / price;
            } else {
                tokensAtCurrentPrice = (remainingPayment * 10**30) / price;
            }
            
            if (tokensAtCurrentPrice == 0) {
                currentPhase++;
                continue;
            }
            
            uint256 tokensToBuyInPhase = remainingInPhase;
            uint256 paymentForPhase;
            
            if (tokensAtCurrentPrice <= remainingInPhase) {
                tokensToBuyInPhase = tokensAtCurrentPrice;
                paymentForPhase = remainingPayment;
                remainingPayment = 0;
            } else {
                if (isNativePayment) {
                    paymentForPhase = (remainingInPhase * price) / 10**18;
                } else {
                    paymentForPhase = (remainingInPhase * price) / 10**30;
                }
                remainingPayment -= paymentForPhase;
            }
            
            totalPaymentRequired += paymentForPhase;
            
            phases[currentPhase].tokensSold += tokensToBuyInPhase;
            totalTokensToReceive += tokensToBuyInPhase;
            
            emit TokensPurchased(
                msg.sender, 
                tokensToBuyInPhase, 
                price, 
                currentPhase, 
                !isNativePayment
            );
            
            if (phases[currentPhase].tokensSold >= phases[currentPhase].cap) {
                currentPhase++;
                currentPhaseId = currentPhase;
                uint256 timestamp = block.timestamp;
                phaseChangeTimestamps[currentPhaseId] = timestamp;
                emit PhaseAdvanced(currentPhaseId, block.number);
                emit PhaseTimestampUpdated(currentPhaseId, timestamp);
            }
        }
        
        if (remainingPayment > 0) revert MaxSupplyExceeded();
        if (paymentAmount < totalPaymentRequired) revert InsufficientPayment();
        
        totalTokensSold += totalTokensToReceive;
        tokensPurchased[msg.sender] += totalTokensToReceive;

        Purchase storage userPurchase = purchases[msg.sender];
        
        if (userPurchase.amount.length == 0) {
            userPurchase.amount = new uint256[](1);
            userPurchase.amount[0] = totalTokensToReceive;
            userPurchase.claimed = false;
        } else {
            userPurchase.amount.push(totalTokensToReceive);
        }
        
        if (isNativePayment) {
            payable(fundingWallet).sendValue(paymentAmount);
        }
        
        emit FundsForwarded(fundingWallet, paymentAmount, !isNativePayment);
        
        if (totalTokensSold >= getTotalCap()) {
            presaleEnded = true;
            emit PresaleEnded(block.number);
        }
    }

    function endPresale() external onlyOwner {
        if (!isPresaleActive()) revert PresaleNotStarted();
        presaleEnded = true;
        emit PresaleEnded(block.number);
    }

    function setFinalPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert InvalidPrice();
        finalPrice = newPrice;
        emit FinalPriceUpdated(newPrice);
    }

    function isPresaleComplete() public view returns (bool) {
        return totalTokensSold >= getTotalCap() || presaleEnded;
    }
    
    function recoverTokens() external onlyOwner {
        if (!isPresaleComplete()) revert PresaleNotEnded();
        uint256 balance = token.balanceOf(address(this));
        if (!token.transfer(owner(), balance)) revert TokenRecoveryFailed();
    }

    function recoverERC20(address tokenAddress) external onlyOwner {
        if (tokenAddress == address(token)) revert InvalidAddress();
        IERC20 tokenToRecover = IERC20(tokenAddress);
        uint256 balance = tokenToRecover.balanceOf(address(this));
        if (!tokenToRecover.transfer(owner(), balance)) revert TokenRecoveryFailed();
    }
    
    function getPhaseInfo(uint256 phaseId) external view returns (
        uint256 price,
        uint256 cap,
        uint256 tokensSold
    ) {
        if (phaseId >= TOTAL_PHASES) revert InvalidPhase();
        Phase memory phase = phases[phaseId];
        return (phase.price, phase.cap, phase.tokensSold);
    }
    
    function getRemainingTokensInPhase(uint256 phase) public view returns (uint256) {
        if (phase >= TOTAL_PHASES) revert InvalidPhase();
        return phases[phase].cap - phases[phase].tokensSold;
    }
    
    function getTotalRemainingTokens() public view returns (uint256) {
        return TOTAL_SUPPLY - totalTokensSold;
    }

    function getTotalCap() public view returns (uint256) {
        uint256 totalCap = 0;
        for(uint256 i = 0; i < TOTAL_PHASES; i++) {
            totalCap += phases[i].cap;
        }
        return totalCap;
    }

    function getCurrentPhase() public view returns (uint256) {
        if (!isPresaleActive()) return 0;
        if (presaleEnded) return TOTAL_PHASES;
        return currentPhaseId;
    }

    function isPresaleActive() public view returns (bool) {
        return presaleStartBlock > 0 && !presaleEnded;
    }

    function isClaimingEnabled() external view returns (bool) {
        return claimingEnabled;
    }

    function enableClaiming() external onlyOwner {
        if (!isPresaleComplete()) revert PresaleNotEnded();
        claimingEnabled = true;
    }

    function claim() external nonReentrant whenNotPaused {
        if (!claimingEnabled) revert ClaimingNotEnabled();
        
        Purchase storage userPurchase = purchases[msg.sender];
        if (userPurchase.amount.length == 0) revert NothingToClaim();
        if (userPurchase.claimed) revert AlreadyClaimed();

        uint256 totalAmount = 0;
        for(uint256 i = 0; i < userPurchase.amount.length; i++) {
            totalAmount += userPurchase.amount[i];
        }

        if (totalAmount == 0) revert NothingToClaim();

        userPurchase.claimed = true;

        if (!token.transfer(msg.sender, totalAmount)) revert TransferFailed();

        emit TokensClaimed(msg.sender, totalAmount);
    }

    function setIpTokenPrice(uint256 newPrice) external {
        if (!hasRole(ADMIN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) 
            revert AccessControlUnauthorizedAccount(msg.sender, ADMIN_ROLE);
        if (newPrice == 0) revert InvalidPrice();
        uint256 oldPrice = ipTokenPrice;
        ipTokenPrice = newPrice;
        emit IpTokenPriceUpdated(oldPrice, newPrice);
    }

    function getClaimableAmount(address user) external view returns (uint256) {
        Purchase storage userPurchase = purchases[user];
        if (userPurchase.amount.length == 0 || userPurchase.claimed) {
            return 0;
        }

        uint256 totalAmount = 0;
        for(uint256 i = 0; i < userPurchase.amount.length; i++) {
            totalAmount += userPurchase.amount[i];
        }

        return totalAmount;
    }
}