// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/**
 * @title PipePresale
 * @notice A phased token presale contract with support for IP and USDC payments
 * @dev Implements a multi-phase presale system with different price tiers and caps
 */
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
    uint256 public constant MIN_DEADLINE_DURATION = 1 hours;
    
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
    event FundingWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event FundsForwarded(address indexed to, uint256 amount, bool isUsdcPayment);
    event TokensClaimed(address indexed user, uint256 amount);
    event PresalePaused(address indexed by);
    event PresaleUnpaused(address indexed by);
    event IpTokenPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event PhaseManuallyAdvanced(uint256 oldPhase, uint256 newPhase, uint256 timestamp);

    modifier whenNotPaused() {
        if (paused) revert("Presale is paused");
        _;
    }

    /**
     * @notice Initializes the presale contract with token addresses and admin roles
     * @param _token Address of the token being sold
     * @param _usdc Address of the USDC token accepted for payment
     * @param _fundingWallet Address where funds will be sent
     * @param _admin1 First admin address
     * @param _admin2 Second admin address
     */
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
            revert("Invalid Address");
            
        token = IERC20(_token);
        usdcToken = IERC20(_usdc);
        usdcPermit = IERC20Permit(_usdc);
        fundingWallet = _fundingWallet;
        presaleEnded = false;
        paused = false;
        
        _initializePhases();
    }

    /**
     * @notice Pauses the presale
     * @dev Can only be called by the owner
     */
    function pause() external onlyOwner {
        paused = true;
        emit PresalePaused(msg.sender);
    }

    /**
     * @notice Unpauses the presale
     * @dev Can only be called by the owner
     */
    function unpause() external onlyOwner {
        paused = false;
        emit PresaleUnpaused(msg.sender);
    }

    /**
     * @notice Initializes the presale phases with predefined prices and caps
     * @dev Sets up 8 phases with different token prices and allocation caps
     */
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
            if(prices[i] == 0) revert("Invalid Price");
            phases[i] = Phase({
                price: prices[i],
                cap: caps[i],
                tokensSold: 0
            });
        }
    }

    /**
     * @notice Updates the wallet address where funds will be sent
     * @param newWallet The new funding wallet address
     */
    function setFundingWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert("Invalid Address");
        address oldWallet = fundingWallet;
        fundingWallet = newWallet;
        emit FundingWalletUpdated(oldWallet, newWallet);
    }

    /**
     * @notice Starts the presale
     * @dev Can only be called once and requires ipTokenPrice to be set
     */
    function startPresale() external onlyOwner whenNotPaused {
        if (presaleStartBlock != 0) revert("Presale already started");
        if (ipTokenPrice == 0) revert("Invalid Price");
        presaleEnded = false;
        presaleStartBlock = block.number;
        emit PresaleStarted(presaleStartBlock);
    }

    /**
     * @notice Manually advances the presale to the next phase
     * @dev Can only be called by admins and transfers remaining allocation to next phase
     */
    function advancePhaseManually() external whenNotPaused {
        if (!hasRole(ADMIN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) 
            revert AccessControlUnauthorizedAccount(msg.sender, ADMIN_ROLE);
            
        if (!isPresaleActive()) revert("Presale not started");
        if (presaleEnded) revert("Presale has ended");
        if (currentPhaseId >= TOTAL_PHASES - 1) revert("Invalid phase progression");
        
        uint256 oldPhase = currentPhaseId;
        currentPhaseId++;

        uint256 remainingInOldPhase = phases[oldPhase].cap - phases[oldPhase].tokensSold;
        phases[currentPhaseId].cap += remainingInOldPhase;
        
        uint256 timestamp = block.timestamp;
        
        emit PhaseManuallyAdvanced(oldPhase, currentPhaseId, timestamp);
        emit PhaseAdvanced(currentPhaseId, block.number);

    }

    /**
     * @notice Checks if an address belongs to a contract
     * @dev Uses assembly to check contract code size
     * @dev Note that this method won't detect contracts during their construction
     * @dev Also note that this method will return false for addresses of contracts 
     *      that are still being deployed
     * @param addr Address to check
     * @return bool True if address is a contract, false if it's an EOA
     */
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }

    /**
     * @notice Allows users to buy tokens with IP
     * @dev Forwards IP to funding wallet after purchase
     */
    function buyTokens() external payable nonReentrant whenNotPaused {
        if (_isContract(msg.sender)) revert("Contracts not allowed");
        if (msg.value == 0) revert("Invalid amount");
        _processTokenPurchase(msg.value, true);
        (bool success,) = fundingWallet.call{value: msg.value}("");
        if (!success) revert("Transfer failed");
        emit FundsForwarded(fundingWallet, msg.value, true);
    }

    /**
     * @notice Allows users to buy tokens with USDC using permit
     * @param paymentAmount Amount of USDC to spend
     * @param deadline Deadline for the permit
     * @param v Part of signature
     * @param r Part of signature
     * @param s Part of signature
     */
    function buyTokensWithUSDCPermit(
        uint256 paymentAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused {
        if (_isContract(msg.sender)) revert("Contracts not allowed");
        if (deadline < block.timestamp + MIN_DEADLINE_DURATION) revert("Deadline too short");
        if (paymentAmount == 0) revert("Invalid amount");
        
        usdcPermit.permit(
            msg.sender,     // owner
            address(this),  // spender
            paymentAmount,     // value
            deadline,       // deadline
            v, r, s        // signature parameters
        );
        
        _processTokenPurchase(paymentAmount, false);
        
        if (!usdcToken.transferFrom(msg.sender, fundingWallet, paymentAmount)) revert("Transfer failed");
        emit FundsForwarded(fundingWallet, paymentAmount, false);
    }

    /**
     * @notice Internal function to process token purchases
     * @dev Handles multi-phase purchases and updates state
     * @param paymentAmount Amount paid in IP or USDC
     * @param isNativePayment Whether payment is in IP
     */
    function _processTokenPurchase(uint256 paymentAmount, bool isNativePayment) private {
        if (!isPresaleActive()) revert("Presale not started");
        if (presaleEnded) revert("Presale has ended");

        uint256 remainingPayment;

        if (isNativePayment) {
             remainingPayment = (paymentAmount * ipTokenPrice) / 10**30;
         } else {
             remainingPayment = paymentAmount;
         }
        
        uint256 currentPhase = currentPhaseId;
        
        uint256 totalTokensToReceive = 0;
        uint256 totalPaymentRequired = 0;
        
        while (remainingPayment > 0 && currentPhase < TOTAL_PHASES) {

            uint256 price = phases[currentPhase].price;

            uint256 remainingInPhase = phases[currentPhase].cap - phases[currentPhase].tokensSold;
            
            uint256 tokensAtCurrentPrice;
            tokensAtCurrentPrice = (remainingPayment * 10**30) / price; 

            if (tokensAtCurrentPrice >= getTotalCap()) {
                revert("Maximum Presale Token Amount Exceeded");
            }

            if (tokensAtCurrentPrice == 0) {
                currentPhase++;
                continue;
            }
            
            uint256 paymentForPhase;
            
            if (tokensAtCurrentPrice <= remainingInPhase) {
                remainingInPhase = tokensAtCurrentPrice;
                paymentForPhase = remainingPayment;
                remainingPayment = 0;
            } else {
                paymentForPhase = (remainingInPhase * price) / 10**30;
                remainingPayment -= paymentForPhase;
            }
            
            totalPaymentRequired += paymentForPhase;
            
            phases[currentPhase].tokensSold += remainingInPhase;
            totalTokensToReceive += remainingInPhase;

            
            emit TokensPurchased(
                msg.sender, 
                remainingInPhase, 
                price, 
                currentPhase, 
                !isNativePayment
            );
            
            if (phases[currentPhase].tokensSold >= phases[currentPhase].cap) {
                currentPhase++;
                currentPhaseId = currentPhase;
                emit PhaseAdvanced(currentPhaseId, block.number);
            }
        }
        
        if (remainingPayment > 0) revert("Max supply exceeded");
        if (paymentAmount < totalPaymentRequired) revert("Insufficient payment");
        
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
        
        if (totalTokensSold >= getTotalCap()) {
            presaleEnded = true;
            emit PresaleEnded(block.number);
        }
    } 

    /**
     * @notice Ends the presale manually
     * @dev Can only be called by the owner when presale is active
     */
    function endPresale() external onlyOwner {
        if (!isPresaleActive()) revert("Presale not started");
        presaleEnded = true;
        emit PresaleEnded(block.number);
    }

    /**
     * @notice Sets the final token price
     * @param newPrice New final price in wei
     */
    function setFinalPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert("Invalid Price");
        finalPrice = newPrice;
        emit FinalPriceUpdated(newPrice);
    }

    /**
     * @notice Checks if the presale is complete
     * @return bool True if all tokens are sold or presale is manually ended
     */
    function isPresaleComplete() public view returns (bool) {
        return totalTokensSold >= getTotalCap() || presaleEnded;
    }
    
    /**
     * @notice Recovers unsold tokens after presale ends
     * @dev Can only be called by owner after presale completion
     */
    function recoverTokens() external onlyOwner {
        if (!isPresaleComplete()) revert("Presale not ended");
        uint256 balance = token.balanceOf(address(this));
        if (!token.transfer(owner(), balance)) revert("Token recovery failed");
    }

    /**
     * @notice Recovers any ERC20 tokens accidentally sent to contract
     * @param tokenAddress Address of token to recover
     * @dev Cannot be used to recover presale tokens
     */
    function recoverERC20(address tokenAddress) external onlyOwner {
        if (tokenAddress == address(token)) revert("Invalid Address");
        IERC20 tokenToRecover = IERC20(tokenAddress);
        uint256 balance = tokenToRecover.balanceOf(address(this));
        if (!tokenToRecover.transfer(owner(), balance)) revert("Token recovery failed");
    }
    
    /**
     * @notice Gets information about a specific phase
     * @param phaseId ID of the phase to query
     * @return price Price per token in this phase
     * @return cap Maximum tokens available in this phase
     * @return tokensSold Number of tokens sold in this phase
     */
    function getPhaseInfo(uint256 phaseId) external view returns (
        uint256 price,
        uint256 cap,
        uint256 tokensSold
    ) {
        if (phaseId >= TOTAL_PHASES) revert("Invalid phase");
        Phase memory phase = phases[phaseId];
        return (phase.price, phase.cap, phase.tokensSold);
    }
    
    /**
     * @notice Gets remaining tokens available in a specific phase
     * @param phase Phase ID to query
     * @return uint256 Number of tokens remaining in the phase
     */
    function getRemainingTokensInPhase(uint256 phase) public view returns (uint256) {
        if (phase >= TOTAL_PHASES) revert("Invalid phase");
        return phases[phase].cap - phases[phase].tokensSold;
    }
    
    /**
     * @notice Gets total remaining tokens across all phases
     * @return uint256 Total number of unsold tokens
     */
    function getTotalRemainingTokens() public view returns (uint256) {
        return TOTAL_SUPPLY - totalTokensSold;
    }

    /**
     * @notice Gets total token cap across all phases
     * @return uint256 Sum of all phase caps
     */
    function getTotalCap() public view returns (uint256) {
        uint256 totalCap = 0;
        for(uint256 i = 0; i < TOTAL_PHASES; i++) {
            totalCap += phases[i].cap;
        }
        return totalCap;
    }

    /**
     * @notice Gets current phase ID
     * @return uint256 Current phase ID or TOTAL_PHASES if ended
     */
    function getCurrentPhase() public view returns (uint256) {
        if (!isPresaleActive()) return 0;
        if (presaleEnded) return TOTAL_PHASES;
        return currentPhaseId;
    }

    /**
     * @notice Checks if presale is currently active
     * @return bool True if presale has started and not ended
     */
    function isPresaleActive() public view returns (bool) {
        return presaleStartBlock > 0 && !presaleEnded;
    }

    /**
     * @notice Checks if token claiming is enabled
     * @return bool True if claiming is enabled
     */
    function isClaimingEnabled() external view returns (bool) {
        return claimingEnabled;
    }

    /**
     * @notice Enables token claiming after presale
     * @dev Can only be called by owner after presale ends
     */
    function enableClaiming() external onlyOwner {
        if (!isPresaleComplete()) revert("Presale not ended");
        claimingEnabled = true;
    }

    /**
     * @notice Allows users to claim their purchased tokens
     * @dev Requires claiming to be enabled and presale to be complete
     */
    function claim() external nonReentrant whenNotPaused {
        if (!claimingEnabled) revert("Claimed not enabled");
        
        Purchase storage userPurchase = purchases[msg.sender];
        if (userPurchase.amount.length == 0) revert("Nothing to claim");
        if (userPurchase.claimed) revert("Already claimed");

        uint256 totalAmount = 0;
        for(uint256 i = 0; i < userPurchase.amount.length; i++) {
            totalAmount += userPurchase.amount[i];
        }

        if (totalAmount == 0) revert("Nothing to claim");

        userPurchase.claimed = true;

        if (!token.transfer(msg.sender, totalAmount)) revert("Transfer failed");

        emit TokensClaimed(msg.sender, totalAmount);
    }

    /**
     * @notice Sets the price of IP token in wei
     * @param newPrice New price in wei
     * @dev Can only be called by admins
     */
    function setIpTokenPrice(uint256 newPrice) external {
        if (!hasRole(ADMIN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) 
            revert AccessControlUnauthorizedAccount(msg.sender, ADMIN_ROLE);
        if (newPrice == 0) revert("Invalid Price");
        uint256 oldPrice = ipTokenPrice;
        ipTokenPrice = newPrice;
        emit IpTokenPriceUpdated(oldPrice, newPrice);
    }

    /**
     * @notice Gets the amount of tokens a user can claim
     * @param user Address of the user
     * @return uint256 Amount of tokens available to claim
     */
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