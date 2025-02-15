import { OpenAI } from 'openai';
import { DatabaseContext } from '../types/ai.types';
import { DatabaseSchema } from '../types/schema.types';

export async function generateAIResponse(query: string) {
  const systemPrompt = `
  You are an expert MongoDB query generator. Your role is to convert natural language requests into precise, **optimized**, and **efficient** MongoDB queries.
  You are provided with a detailed database schema, including field names, data types, semantic meanings, tags, and relationships between collections.

  **Key Responsibilities:**
  1. **Intent Recognition:** Understand the core intent behind the user's natural language request.
  2. **Schema-Driven Query Construction:** Carefully analyze the provided schema to:
     - Identify exact field names, data types, and nested fields.
     - Leverage relationships between collections to construct accurate, relational queries.
     - Consider semantic meanings and tags for context-based query optimization.
  3. **Dynamic Operator Selection:** Choose the most appropriate MongoDB operators based on field type and intent:
     - **Numerical fields:** Use **$gt**, **$lt**, **$gte**, **$lte**, and **$eq** for comparison.
     - **String fields:** Use operators like **$in**, **$eq**, or **$regex** when appropriate.
     - **Date fields:** Handle date ranges with **$gte** and **$lte**.
  4. **Efficient Nested Field Handling:** Ensure correct access of fields in embedded documents or sub-documents using dot notation (e.g., **"profile.address.city"**). Avoid unnecessary queries that iterate over entire collections.
  5. **Relationship Awareness:** Accurately utilize relationships (e.g., foreign keys or references between collections) to construct **$lookup** queries instead of subqueries like $nin to avoid performance degradation.
  6. **Performance Optimization:** Focus on generating queries that:
     - Minimize the number of documents scanned.
     - Avoid using **slow subqueries**, such as 'nin' with large lists or 'distinct' within a query filter.
     - Leverage **indexes** and **aggregation pipelines** for better performance.
     - Use **lookup**, **group**, and **unwind** efficiently in aggregation queries.

  **Output Format:**
  Return a JSON object containing:
  - **mongoQuery:** The MongoDB query as a properly formatted string.
  - **explanation:** A concise explanation that includes:
    - Why specific collections and fields were selected.
    - How relationships, semantic meaning, data types, and nested structures influenced the query.
    - Assumptions made to interpret the user's request.
    - Performance considerations and optimization strategies.

  **Important Guidelines:**
  - Always prioritize **efficient and optimized queries**.
  - Cross-reference the schema to validate exact field names, including nested and referenced fields.
  - Avoid slow operations: nin with subqueries, distinct operations, and unoptimized lookups
  - Leverage indexes and aggregation pipelines for better performance
  - Use appropriate aggregation operators (lookup, group, unwind) efficiently
  - Ensure correct access of fields in embedded documents using dot notation (e.g., "profile.address.city").
  - Use comparison operators (gt, lt, gte, lte, eq) appropriately.

  **Remember:** Your goal is to generate accurate and high-performance MongoDB queries that are both readable and efficient.
`;

  const userPrompt = `
    Given this database context and schema:

    ### Database Overview
This MongoDB database is designed for an e-commerce platform. It contains five collections: 'users', 'products', 'orders', 'reviews', and 'payments'. Each collection is described below with its fields and sample data.


 ### Collection: 'users'
  - Contains detailed information about users, including personal information, verification statuses, financial setup, notifications, and contact details.

  **Fields:**
  - **_id**: ObjectId – Unique identifier for each user.
  - **investorbankDetailsLB**: Boolean – Indicates whether the user has investor bank details linked.
  - **language**: String – The preferred language of the user.
  - **newUser**: Boolean – Indicates if the user is a new registration.
  - **kyc**: Boolean – Indicates whether the user has completed Know Your Customer (KYC) verification.
  - **panVerified**: Boolean – Indicates whether the user's PAN (Permanent Account Number) has been verified.
  - **isActive**: Boolean – Indicates whether the user's account is currently active.
  - **lbUserVerified**: Boolean – Indicates whether the user has been verified by the lending bank.
  - **notificationCount**: Number – Represents the number of notifications pending for the user.
  - **augmontUserSet**: Boolean – Indicates whether the user has been set up in the Augmont system.
  - **bankAccountDetailLbVerified**: Boolean – Indicates whether the user's bank account details have been verified by the lending bank.
  - **phoneNumber**: String – The user's phone number for contact purposes.
  - **firebaseUID**: String – Unique identifier for the user in Firebase.
  - **investorType**: String – The type of investor the user is classified as.
  - **lbUserId**: String – Unique identifier for the user in the lending bank system.
  - **financialChecklist**: Object – Contains the user's financial preferences and checklist for investment strategies.
  - **notificationDetails**: Object – Contains details about notifications sent to the user.
    - **notificationDetails._id**: ObjectId – Unique identifier for the notification details.
  - **firebaseNotificationTokens**: Array – Stores Firebase notification tokens for the user’s devices.
  - **goals**: Array – Represents the user's financial or investment goals.
  - **dependants**: Array – List of dependants associated with the user.
  - **plutoFixedInvestmentDetails**: Object – Details regarding fixed investments made by the user in the Pluto system.
    - **plutoFixedInvestmentDetails.exitLoad**: Number – Indicates the exit load for fixed investments.
    - **plutoFixedInvestmentDetails.interestPerDay**: Number – Represents the interest earned per day on fixed investments.
  - **plutoPlusInvestmentDetails**: Object – Details regarding additional investments made by the user in the Pluto Plus system.
    - **plutoPlusInvestmentDetails._id**: ObjectId – Unique identifier for the Pluto Plus investment details.
  - **createdAt**: Date – Timestamp indicating when the user record was created.
  - **updatedAt**: Date – Timestamp indicating when the user record was last updated.
  - **__v**: Number – Version key for the document, used for version control.
  - **referral**: Object – Contains referral information related to the user.
  - **email**: String – The user's email address for contact and notifications.
  - **expense**: Number – Represents the user's recorded expenses.
  - **name**: String – The user's name for identification purposes.
  - **bankAccountDetail**: Object – Contains the user's bank account details.
  - **goldInvestmentDetails**: Object – Details regarding the user's investments in gold.
    - **goldInvestmentDetails.goldValueLastSyncedAt**: Date – Timestamp indicating when the gold investment value was last updated.
    - **goldInvestmentDetails.myLastUpdatedGoldValue**: Number – Represents the last updated value of the user's gold investments.
    - **goldInvestmentDetails._id**: ObjectId – Unique identifier for the gold investment details.
  - **silverInvestmentDetails**: Object – Details regarding the user's investments in silver.
    - **silverInvestmentDetails._id**: ObjectId – Unique identifier for the silver investment details.
  - **referralInfo**: Object – Contains information about the user's referral activities.
  - **aadharData**: Object – Contains the user's Aadhar card information.
  - **fatherName**: String – The name of the user's father, if provided.
  - **panData**: Object – Contains information related to the user's PAN card.
    - **panData.father**: String – The name of the user's father as per PAN data.
  - **activeSilverSip**: Object – Indicates whether the user has an active silver SIP (Systematic Investment Plan).
    - **activeSilverSip.buffer**: Object – Buffer data related to the user's active silver SIP.
  - **monthlySavableAmount**: Number – Represents the amount the user can save monthly.
  - **nominee**: Object – Contains information about the user's nominated beneficiary.
  - **notifiedUserForSmartSavings**: Boolean – Indicates whether the user has been notified about smart savings options.
  - **activeGoldSip**: Boolean – Indicates whether the user has an active gold SIP (Systematic Investment Plan).
  - **address**: Object – Contains the user's address information.
  - **dob**: Date – The user's date of birth, if provided.
  - **gender**: String – The user's gender, if provided.
  - **augmontUserKycApproved**: Boolean – Indicates whether the user's KYC has been approved by Augmont.
  - **activePlutoPlusSip**: Boolean – Indicates whether the user has an active Pluto Plus SIP.
  - **source**: String – Indicates the source from which the user was referred or registered.
  - **referredBy**: Object – Contains information about who referred the user.

---
   ### Collection: 'payment-transactions'
  - **Collection Description**: This collection holds comprehensive information about payment transactions, including their status, retry counts, transaction metadata, and various nested details related to financial transactions, payment providers, and more.

  **Fields:**
  - **_id**: ObjectId – Unique identifier for each transaction.
  - **retry_count**: Number – Counts the number of retry attempts made for a payment transaction.
  - **goal_investor_id**: Object – Identifies the investor associated with the payment goal.
    - **goal_investor_id.buffer**: Array – Holds a series of numerical values related to the investor's goal.
  - **amount_in_rupees**: Number – Specifies the total amount of the transaction in Indian Rupees.
  - **amount_in_rupees_excluding_taxes**: Number – Indicates the amount of the transaction before taxes are applied.
  - **processing_fee**: Number – Represents the fee charged for processing the payment transaction.
  - **status**: String – Denotes the current status of the payment transaction.
  - **recurring_count**: Number – Indicates the number of times a recurring payment has been processed.
  - **payment_provider**: String – Identifies the provider facilitating the payment transaction.
  - **transaction_meta_data**: Object – Contains metadata related to the transaction.
    - **transaction_meta_data.success**: Boolean – Indicates whether the transaction was successful.
    - **transaction_meta_data.code**: String – Contains a code representing the outcome of the transaction.
    - **transaction_meta_data.message**: String – Provides a message related to the transaction outcome.
    - **transaction_meta_data.data**: Object – Holds detailed data about the transaction.
      - **transaction_meta_data.data.merchantId**: String – Identifies the merchant associated with the transaction.
      - **transaction_meta_data.data.merchantTransactionId**: String – Represents the transaction ID assigned by the merchant.
      - **transaction_meta_data.data.transactionId**: String – Holds the unique identifier for the transaction.
      - **transaction_meta_data.data.amount**: Number – Specifies the amount involved in the transaction.
      - **transaction_meta_data.data.state**: String – Indicates the current state of the transaction.
      - **transaction_meta_data.data.responseCode**: String – Contains the response code from the payment provider.
      - **transaction_meta_data.data.paymentInstrument**: Object – Details the payment instrument used for the transaction.
        - **paymentInstrument.type**: String – Specifies the type of payment instrument used.
        - **paymentInstrument.utr**: String – Holds the Unique Transaction Reference number for tracking.
        - **paymentInstrument.upiTransactionId**: String – Contains the UPI transaction ID for the payment.
        - **paymentInstrument.accountHolderName**: String – Holds the name of the account holder for the payment instrument.
        - **paymentInstrument.cardNetwork**: String – Identifies the card network used for the transaction.
        - **paymentInstrument.accountType**: String – Specifies the type of account used for the payment.
    - **transaction_meta_data.status**: String – Indicates the overall status of the transaction metadata.
    - **transaction_meta_data.statusCode**: String – Contains the status code for the transaction metadata response.
    - **transaction_meta_data.result**: Object – Holds the result data of the transaction.
      - **result.data.merchantId**: String – Identifies the merchant associated with the transaction result.
      - **result.data.quantity**: Number – Specifies the quantity involved in the transaction result.
      - **result.data.totalAmount**: Number – Indicates the total amount involved in the transaction result.
      - **result.data.preTaxAmount**: Number – Specifies the amount before taxes in the transaction result.
      - **result.data.metalType**: String – Indicates the type of metal involved in the transaction result.
      - **result.data.rate**: Number – Specifies the rate applicable to the transaction result.
      - **result.data.uniqueId**: String – Holds a unique identifier for the transaction result.
      - **result.data.transactionId**: String – Contains the transaction ID for the result.
      - **result.data.userName**: String – Holds the name of the user associated with the transaction result.
      - **result.data.merchantTransactionId**: String – Represents the merchant's transaction ID for the result.
      - **result.data.mobileNumber**: String – Contains the mobile number associated with the transaction result.
      - **result.data.goldBalance**: Number – Indicates the gold balance after the transaction.
      - **result.data.silverBalance**: Number – Indicates the silver balance after the transaction.
      - **result.data.bankInfo**: Object – Holds information about the bank related to the transaction result.
        - **bankInfo.accountName**: String – Specifies the name of the bank account involved in the transaction.
        - **bankInfo.accountNumber**: String – Contains the account number for the bank account involved.
        - **bankInfo.ifscCode**: String – Holds the IFSC code for the bank account involved.
  - **gold_purchase_result**: Object – Holds the result of a gold purchase transaction.
    - **augmontGoldTransaction**: Object – Holds data related to the Augmont gold transaction.
    - **logs.data**: Array – Stores logs related to the gold purchase transaction.
  - **transaction_meta_data.error**: Object – Contains error information related to the transaction.
    - **error.message**: String – Holds the error message related to the transaction.
    - **error.responseCode**: String – Contains the response code indicating the error type.
    - **error.status**: String – Indicates the status of the error related to the transaction.
  - **status_logs**: Array – An array of logs detailing status changes for the transaction.
  - **offer_id**: String – Represents an identifier for any promotional offer associated with the transaction.
  - **payment_transaction_type**: String – Specifies the type of payment transaction being processed.
  - **createdAt**: Date – Records the date and time when the transaction was created.
  - **updatedAt**: Date – Records the date and time when the transaction was last updated.
  - **__v**: Number – Version key for the document, used for tracking changes.

---
### Collection: 'transactions'
  **Collection Description**: This collection stores all transactional records with detailed metadata and nested objects for payment details, retries, and processing information.

  **Fields:**
  - **_id**: ObjectId – Unique identifier for each transaction.
  - **status**: String – Indicates the current state of the transaction.
  - **paymentUpiApp**: String – Specifies the UPI application used for the payment.
  - **transactionType**: String – Describes the type of transaction (e.g., credit, debit).
  - **amount**: Number – Represents the monetary value involved in the transaction.
  - **userId**: ObjectId – Identifies the user associated with the transaction.
    - **userId.buffer**: Object – Buffer object containing user identification data.
  - **investmentType**: String – Indicates the type of investment related to the transaction.
  - **mode**: String – Specifies the mode of the transaction (e.g., online, offline).
  - **processingFee**: Number – Represents any fees charged for processing the transaction.

  - **phonePeTransactionData**: Object – Contains details related to the PhonePe transaction.
    - **phonePeTransactionData.paymentInstrumentType**: String – Specifies the type of payment instrument used (e.g., UPI, Card).
    - **phonePeTransactionData.transactionId**: String – Unique identifier for the PhonePe transaction.
    - **phonePeTransactionData.amount**: Number – Amount processed via PhonePe.
    - **phonePeTransactionData.state**: String – Indicates the state of the PhonePe transaction (e.g., Success, Pending).
    - **phonePeTransactionData.paymentMethod**: String – Method of payment used (e.g., UPI, Wallet).
    - **phonePeTransactionData.timestamp**: Date – Timestamp when the PhonePe transaction was processed.

  - **createdAt**: Date – Timestamp indicating when the transaction was created.
  - **updatedAt**: Date – Timestamp indicating when the transaction was last updated.
  - **__v**: Number – Version key for the document, used for tracking changes.
  - **sipId**: ObjectId – Identifies the SIP (Systematic Investment Plan) associated with the transaction.
  - **lendboxTransactionData**: Object – Contains details related to the Lendbox transaction.
  - **retryCount**: Number – Indicates the number of times the transaction has been retried.
  - **transactionSummary**: Object – Provides a summary of the transaction including total amounts and other relevant data.
  - **augmontTransactionData**: Object – Contains details related to the Augmont transaction.
  - **withdrawalLogs**: Array – Logs related to withdrawal transactions.
  - **transactionRating**: Number – Represents the rating given to the transaction by users or systems.
  - **plutoFixedLockInPeriod**: Number – Specifies the fixed lock-in period for the transaction.
  - **date**: Date – Represents the date associated with the transaction.

---
  The 'goal-investors' collection tracks investment goals associated with users. Each record links a user to a specific investment goal and provides detailed information such as invested amounts, target amounts, state, and buffers for periodic performance tracking. It also contains metadata related to the user, the investment schedule, and subscription details.

  ### Collection: 'goal-investors'
  **Collection Description**: This collection records each user's participation in investment goals, including regular investments, target achievement tracking, and detailed financial data.

  **Fields:**
  - **_id**: ObjectId – Unique identifier for each record.
  - **goal_id**: ObjectId – Unique identifier for the investment goal.
    - **goal_id.buffer**: Array – A buffer containing numerical values related to the investment goal’s performance.
      - **goal_id.buffer.0**: Number – First numerical value in the buffer.
      - **goal_id.buffer.1**: Number – Second numerical value in the buffer.
      - **goal_id.buffer.n**: Number – Up to the twelfth numerical value in the buffer.

  - **state**: String – Current state of the investment goal (e.g., Active, Completed).
  
  - **user_id**: ObjectId – Unique identifier for the user associated with the investment goal.
    - **user_id.buffer**: Array – A buffer containing numerical values related to user-specific data.
      - **user_id.buffer.0**: Number – First numerical value in the buffer.
      - **user_id.buffer.n**: Number – Twelfth numerical value in the buffer.

  - **amount_invested**: Number – Total amount of money invested in the goal.
  - **amount_withdrawn**: Number – Total amount of money withdrawn from the investment goal.
  - **investment_type**: String – Type of investment (e.g., stocks, bonds).
  - **target_year**: Number – Year in which the investment goal is expected to be achieved.
  - **total_gain**: Number – Total profit or gain from the investment goal.
  - **target_amount**: Number – Amount of money targeted to be achieved by the investment goal.
  - **day_of_month**: Number – Specific day of the month for regular investments.
  - **regular_investment_amount**: Number – Amount of money to be invested regularly.
  - **day_of_week**: String – Specific day of the week for regular investments.
  - **payment_schedule**: Object – Schedule for making payments toward the investment goal.
  - **subscription_id**: String – Unique identifier for the subscription related to the investment.
  - **merchant_subscription_id**: String – Unique identifier for the merchant subscription related to the investment.
  - **goal_bought_in_gms**: Number – Amount of the goal bought in grams (if applicable).
  - **sip_state**: String – State of the Systematic Investment Plan (SIP) (e.g., Active, Paused).
  
  - **createdAt**: Date – Timestamp indicating when the record was created.
  - **updatedAt**: Date – Timestamp indicating when the record was last updated.
  - **__v**: Number – Version key for the document, used for tracking changes.

---

### Collection: 'goals'
  **Collection Description**: This collection stores each goal's data, including details about gains, goal requirements, and metadata for tracking purposes.

  **Fields:**
  - **_id**: ObjectId – Unique identifier for each goal.

  - **name**: String – The name of the goal, representing its title or identifier.
  - **goal_name**: String – An alternative name or description for the goal, potentially for display purposes.
  - **min_investment_amt**: Number – The minimum amount of investment required to participate in the goal.
  - **min_goal_amt**: Number – The minimum amount of money needed to achieve the goal.
  - **status**: String – Indicates whether the goal is currently active or inactive.
  - **image**: String – A URL or path to an image representing the goal visually.
  - **icon**: String – A URL or path to an icon representing the goal visually.

  - **gains_id**: Object – An object containing gain-related data associated with the goal.
    - **gains_id.buffer**: Array – An array of numerical values representing gains over a period, likely for analysis.
      - **gains_id.buffer.0**: Number – First numerical value in the gains buffer.
      - **gains_id.buffer.1**: Number – Second numerical value in the gains buffer.
      - **gains_id.buffer.n**: Number – Up to the twelfth numerical value in the buffer.

  - **createdAt**: Date – The date and time when the goal was created.
  - **updatedAt**: Date – The date and time when the goal was last updated.
  - **__v**: Number – Version key for the document, used for tracking changes in the document schema.

---


    Generate a MongoDB query for this natural language request: "${query}"
    
    Important Instructions:
    1. Carefully analyze the context and schema to determine the most appropriate collection.
    2. Consider the purpose of each collection, field semantics, data types, and relationships.
    3. If relevant fields are nested, ensure correct usage of dot notation (e.g., "parentField.childField").
    4. Validate the query for accuracy and efficiency.

    Return a JSON object with:
    1. mongoQuery: the MongoDB query as a string (ensure you're using the correct collection and field names).
    2. explanation: explanation of how the query works and why you chose this collection and fields based on the schema.
  `;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
    });

    return JSON.parse(completion.choices[0].message.content || '{}');
  } catch (error: unknown) {
    console.error('Error generating MongoDB query:', error);
    throw error;
  }
}



