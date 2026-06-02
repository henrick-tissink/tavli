import { type Locale, DEFAULT_LOCALE, isLocale } from "./locale";

import roCommon from "@/messages/ro/common.json";
import enCommon from "@/messages/en/common.json";
import deCommon from "@/messages/de/common.json";

import roDiscovery from "@/messages/ro/discovery.json";
import enDiscovery from "@/messages/en/discovery.json";
import deDiscovery from "@/messages/de/discovery.json";

import roRestaurant from "@/messages/ro/restaurant.json";
import enRestaurant from "@/messages/en/restaurant.json";
import deRestaurant from "@/messages/de/restaurant.json";

import roMenu from "@/messages/ro/menu.json";
import enMenu from "@/messages/en/menu.json";
import deMenu from "@/messages/de/menu.json";

import roBooking from "@/messages/ro/booking.json";
import enBooking from "@/messages/en/booking.json";
import deBooking from "@/messages/de/booking.json";

import roReviews from "@/messages/ro/reviews.json";
import enReviews from "@/messages/en/reviews.json";
import deReviews from "@/messages/de/reviews.json";

import roEvents from "@/messages/ro/events.json";
import enEvents from "@/messages/en/events.json";
import deEvents from "@/messages/de/events.json";

import roProfile from "@/messages/ro/profile.json";
import enProfile from "@/messages/en/profile.json";
import deProfile from "@/messages/de/profile.json";

import roEmails from "@/messages/ro/emails.json";
import enEmails from "@/messages/en/emails.json";
import deEmails from "@/messages/de/emails.json";

import roPartnerCommon from "@/messages/ro/partner.common.json";
import enPartnerCommon from "@/messages/en/partner.common.json";
import dePartnerCommon from "@/messages/de/partner.common.json";

import roPartnerReservations from "@/messages/ro/partner.reservations.json";
import enPartnerReservations from "@/messages/en/partner.reservations.json";
import dePartnerReservations from "@/messages/de/partner.reservations.json";

import roPartnerMenu from "@/messages/ro/partner.menu.json";
import enPartnerMenu from "@/messages/en/partner.menu.json";
import dePartnerMenu from "@/messages/de/partner.menu.json";

import roPartnerTables from "@/messages/ro/partner.tables.json";
import enPartnerTables from "@/messages/en/partner.tables.json";
import dePartnerTables from "@/messages/de/partner.tables.json";

import roPartnerDiners from "@/messages/ro/partner.diners.json";
import enPartnerDiners from "@/messages/en/partner.diners.json";
import dePartnerDiners from "@/messages/de/partner.diners.json";

import roPartnerMarketing from "@/messages/ro/partner.marketing.json";
import enPartnerMarketing from "@/messages/en/partner.marketing.json";
import dePartnerMarketing from "@/messages/de/partner.marketing.json";

import roPartnerAnalytics from "@/messages/ro/partner.analytics.json";
import enPartnerAnalytics from "@/messages/en/partner.analytics.json";
import dePartnerAnalytics from "@/messages/de/partner.analytics.json";

/** Structural contract for the `common` namespace. */
export interface CommonMessages {
  languageName: string;
  switchLanguage: string;
  locales: Record<Locale, string>;
  cities: Record<string, string>;
}

/** Structural contract for the `discovery` namespace. */
export interface DiscoveryMessages {
  search: {
    placeholder: string;
    back: string;
    recentTitle: string;
    clearAll: string;
    trendingTitle: string;
    categoriesTitle: string;
    resultsRestaurants: string;
    resultsCuisines: string;
    noResults: string;
    cuisineCount: { one: string; few: string; other: string };
    trending: { bbq: string; rooftop: string; brunch: string; newOpenings: string };
    categories: {
      pizza: string; japanese: string; steak: string; vegan: string;
      coffee: string; cocktails: string; burgers: string; fish: string;
    };
  };
  filters: {
    all: string;
    openNow: string;
    privateEvent: string;
    cuisine: string;
    price: string;
    neighborhood: string;
    more: string;
    moreAriaLabel: string;
    title: string;
    reset: string;
    minRating: string;
    ratingAny: string;
    noResults: string;
    showResults: { one: string; few: string; other: string };
    priceAccessible: string;
    priceModerate: string;
    pricePremium: string;
    priceExclusive: string;
  };
  feed: {
    noMatchTitle: string;
    noMatchBody: string;
    resetFilters: string;
    trendingTitle: string;
    trendingSubtitle: string;
    availableTodayTitle: string;
    availableTodaySubtitle: string;
    newTitle: string;
    newSubtitle: string;
    weekRestaurant: string;
    availableToday: string;
    viewRestaurant: string;
  };
  map: {
    searchPlaceholder: string;
    filters: string;
    closeMap: string;
  };
  card: {
    saveAriaLabel: string;
    viewAriaLabel: string;
    privateEventBadge: string;
    reviews: { one: string; few: string; other: string };
    topDimension: string;
  };
  cover: {
    tagline: string;
    availableCount: { one: string; few: string; other: string };
    availableIntro: string;
    searchCta: string;
  };
  dietary: {
    vegan: string;
    vegetarian: string;
    glutenFree: string;
    spicy: string;
    clear: string;
  };
  tabs: {
    discover: string;
    map: string;
    search: string;
    saved: string;
    profile: string;
    navAriaLabel: string;
  };
  nav: {
    logoAriaLabel: string;
    searchPlaceholder: string;
    savedAriaLabel: string;
    profileAriaLabel: string;
  };
}

/** Structural contract for the `restaurant` namespace. */
export interface RestaurantMessages {
  notFound: { title: string; back: string };
  detail: {
    availableToday: string;
    noSlotsTitle: string;
    noSlotsBody: string;
    bookOtherDay: string;
    readMore: string;
    showLess: string;
    chefPicksTitle: string;
    chefPicksSubtitle: string;
    viewMenu: string;
    viewMenuLabel: string;
    viewMenuFull: string;
    pickBadge: string;
    viewMenuRecommendations: { one: string; few: string; other: string };
    reviewsTitle: string;
    reviewsSubtitle: string;
    scheduleTitle: string;
    scheduleSubtitle: string;
    locationTitle: string;
    locationSubtitle: string;
    directionsLink: string;
    nearbyTitle: string;
    nearbySubtitle: string;
    bookTable: string;
    stickyBookCta: string;
    stickyNextSlot: string;
  };
  gallery: { backAriaLabel: string; saveAriaLabel: string; shareAriaLabel: string };
  reviewCard: {
    bookedContext: string;
    guestOne: string;
    guestOther: string;
    helpful: string;
    restaurantReply: string;
  };
  reviewIntelligence: {
    title: string;
    basedOn: { one: string; few: string; other: string };
    topMentionsTitle: string;
    bestForTitle: string;
  };
  cuisineAdjectives: Record<string, string>;
}

/** Structural contract for the `menu` namespace. */
export interface MenuMessages {
  meta: {
    title: string;
  };
  viewer: {
    backAriaLabel: string;
    menuLabel: string;
    dishesCount: { one: string; few: string; other: string };
    priceRange: string;
    chefPicksTitle: string;
    chefPicksCount: { one: string; few: string; other: string };
    viewItem: string;
    noMatchBody: string;
    clearFilters: string;
  };
  itemCard: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
  };
  itemSheet: {
    chefPickAriaLabel: string;
    popularLabel: string;
    veganLabel: string;
    vegetarianLabel: string;
    glutenFreeLabel: string;
    spicyLabel: string;
    chefNoteTitle: string;
    chefNoteBody: string;
    moreFromSection: string;
  };
  pageClient: {
    noMenuTitle: string;
    noMenuBody: string;
    backTo: string;
  };
}

/** Structural contract for the `booking` namespace. */
export interface BookingMessages {
  sheet: {
    headerLabel: string;
    progress: string;
    back: string;
    continue: string;
    submitting: string;
    submit: string;
    errorGeneric: string;
    errorName: string;
    errorPhone: string;
    errorEmail: string;
    stepDate: { title: string; today: string; tomorrow: string };
    stepParty: {
      title: string;
      decrementAriaLabel: string;
      incrementAriaLabel: string;
      privateEventHint: string;
      privateEventLink: string;
      hintDinner: string;
      hintLunch: string;
      hintFriends: string;
    };
    stepSlot: {
      title: string;
      subtitle: string;
      loadingAriaLabel: string;
      noSlots: string;
      noSlotsHint: string;
      zoneLabel: string;
      allZones: string;
    };
    stepIdentity: {
      title: string;
      nameLabel: string;
      phoneLabel: string;
      emailLabel: string;
      occasionLabel: string;
      occasionNone: string;
      occasionBirthday: string;
      occasionAnniversary: string;
      birthdayDateLabel: string;
      anniversaryDateLabel: string;
      notesLabel: string;
      summaryToday: string;
      summaryTomorrow: string;
      guests: { one: string; few: string; other: string };
    };
    stepSent: {
      title: string;
      subtitle: string;
      viewReservation: string;
      backToRestaurant: string;
    };
  };
  confirmed: {
    eyebrow: string;
    awaitingYou: string;
    forParty: string;
    waitingBadge: string;
    addressLabel: string;
    directionsLink: string;
    phoneLabel: string;
    calendarLabel: string;
    calendarDownload: string;
    calendarAriaLabel: string;
    needToCancel: string;
    cancelLink: string;
    partyUnit: { one: string; few: string; other: string };
    icsSummary: string;
  };
  cancel: {
    reasonLabel: string;
    reasonPlaceholder: string;
    submitPending: string;
    submitLabel: string;
    confirmDialog: string;
    doneTitle: string;
    doneBody: string;
    errorGeneric: string;
  };
  modify: {
    pageTitle: string;
    modifyingLabel: string;
    dateLabel: string;
    timeLabel: string;
    partySizeLabel: string;
    submitPending: string;
    submitLabel: string;
    doneTitle: string;
    doneBody: string;
    errorGeneric: string;
    windowClosedBody: string;
    callLink: string;
    emailLink: string;
    backLink: string;
    configMissing: string;
    notFound: string;
  };
  tokenPage: {
    reservationLabel: string;
    alreadyCancelledTitle: string;
    alreadyCancelledBody: string;
    completedTitle: string;
    completedBody: string;
    notFoundTitle: string;
    notFoundBody: string;
    configMissingTitle: string;
    configMissingBody: string;
    contactLabel: string;
  };
  errors: {
    modifyWindowClosed: string;
    modifyTerminal: string;
    modifySlotFull: string;
    modifyConflict: string;
    modifyFailed: string;
    configMissing: string;
    cancelFailed: string;
  };
}

/** Structural contract for the `reviews` namespace. */
export interface ReviewsMessages {
  page: {
    eyebrow: string;
    readyHeading: string;
    readyBody: string;
    alreadyReviewedTitle: string;
    alreadyReviewedBody: string;
    ineligibleTitle: string;
    ineligibleBody: string;
    notFoundTitle: string;
    notFoundBody: string;
    configMissingTitle: string;
    configMissingBody: string;
    contactLabel: string;
  };
  form: {
    ratingLegend: string;
    commentLabel: string;
    commentOptional: string;
    commentPlaceholder: string;
    aggregateLabel: string;
    submitPending: string;
    submitLabel: string;
    errorNoRating: string;
    errorGeneric: string;
    doneTitle: string;
    doneBody: string;
  };
  errors: {
    rateLimited: string;
    visitNotYet: string;
    windowExpired: string;
    editWindowExpired: string;
    editHidden: string;
    editFailed: string;
  };
}

/** Structural contract for the `events` namespace. */
export interface EventsMessages {
  meta: {
    title: string;
    description: string;
  };
  cta: {
    organise: string;
    organisePrivate: string;
    organiseSubtitle: string;
  };
  sheet: {
    titleSuffix: string;
    closeAriaLabel: string;
    occasion: {
      heading: string;
      labels: Record<string, string>;
    };
    date: { label: string; timePrefLabel: string; timePrefPlaceholder: string };
    details: {
      persoanelLabel: string;
      spaceLabel: string;
      budgetLabel: string;
      menuLabel: string;
      dietaryLabel: string;
      notesLabel: string;
    };
    identity: {
      nameLabel: string;
      emailLabel: string;
      phoneLabel: string;
      companyCheckLabel: string;
      cuiLabel: string;
      companyNameLabel: string;
    };
    continue: string;
    back: string;
    submitPending: string;
    submitLabel: string;
    errorGeneric: string;
  };
  sheetV2: {
    titleSuffix: string;
    closeAriaLabel: string;
    dialogAriaLabel: string;
    progress: { stepLabel: string };
    stepOccasion: {
      heading: string;
      subheading: string;
      occasions: Record<string, { label: string; blurb: string }>;
      continue: string;
    };
    stepDate: {
      heading: string;
      leadTimeNotice: string;
      timePrefLabel: string;
      timePrefPlaceholder: string;
      back: string;
      continue: string;
    };
    stepDetails: {
      heading: string;
      partySizeLabel: string;
      spaceLabel: string;
      spaceFreeLabel: string;
      budgetLabel: string;
      menuSectionLabel: string;
      menuPlaceholder: string;
      dietaryPlaceholder: string;
      notesPlaceholder: string;
      back: string;
      continue: string;
    };
    stepIdentity: {
      heading: string;
      nameLabel: string;
      emailLabel: string;
      phoneLabel: string;
      companyCheckLabel: string;
      confirmationNotice: string;
      errorNoOccasion: string;
      back: string;
      submitPending: string;
      submitLabel: string;
    };
    stepSent: {
      heading: string;
      body: string;
      spamNotice: string;
    };
  };
  landing: {
    hero: {
      eyebrow: string;
      heading: string;
      body: string;
      venueCount: { one: string; few: string; other: string };
    };
    occasionGrid: {
      heading: string;
      occasions: Record<string, { label: string; blurb: string }>;
    };
    allVenuesHeading: string;
  };
  tracking: {
    requestLabel: string;
    partySizeUnit: string;
    partnerResponseLabel: string;
    quoteLabel: string;
    quoteCurrency: string;
    acceptQuote: string;
    declineQuote: string;
    declineReasonPrefix: string;
    cancelRequest: string;
    status: Record<string, string>;
  };
}

/** Structural contract for the `profile` namespace. */
export interface ProfileMessages {
  screen: {
    defaultDisplayName: string;
    memberSince: string;
    settingsTitle: string;
    cityLabel: string;
    notificationsLabel: string;
    notificationsAriaLabel: string;
    legalTitle: string;
    legalPrivacy: string;
    legalTerms: string;
    legalCookies: string;
    legalAnpc: string;
    legalContact: string;
    signOut: string;
    signedOutTitle: string;
    signedOutBody: string;
    signIn: string;
  };
  saved: {
    savedTitle: string;
    emptyTitle: string;
    emptyBody: string;
    discoverAction: string;
    bookingsTitle: string;
    bookingsEmptyTitle: string;
    bookingsEmptyBody: string;
    bookingAt: string;
    bookingGuests: { one: string; few: string; other: string };
  };
  auth: {
    signInTitle: string;
    signUpTitle: string;
    signInSubmit: string;
    signUpSubmit: string;
    signInLoading: string;
    signUpLoading: string;
    emailPlaceholder: string;
    emailAriaLabel: string;
    passwordPlaceholder: string;
    passwordAriaLabel: string;
    signInSubtitle: string;
    signUpSubtitle: string;
    confirmationTitle: string;
    confirmationBody: string;
    confirmationAck: string;
    switchToSignUp: string;
    switchToSignIn: string;
    legalPrefix: string;
    legalTerms: string;
    legalAnd: string;
    legalPrivacy: string;
  };
  citySelector: {
    ariaLabel: string;
    comingSoon: string;
  };
  empty: Record<string, never>;
}

/** Plural-bag type used across the emails catalogue. */
type PluralBag = { one: string; few: string; other: string };

/** Structural contract for the `emails` namespace. */
export interface EmailsMessages {
  confirmation: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    reminderText: string;
    cancelButton: string;
    footer: string;
  };
  reminder: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    cancelHint: string;
    manageButton: string;
    footer: string;
  };
  postVisit: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    greetingNoName: string;
    instructionText: string;
    footer: string;
  };
  partnerAlert: {
    subject: string;
    preview: string;
    heading: string;
    covers: PluralBag;
    zoneLabel: string;
    notesLabel: string;
    manageText: string;
    footer: string;
  };
  partnerCancelled: {
    subject: string;
    preview: string;
    heading: string;
    lede: string;
    guests: PluralBag;
    apologyText: string;
    rebookButton: string;
    footer: string;
  };
  eventNew: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    occasionWedding: string;
    occasionBirthday: string;
    occasionCorporateDinner: string;
    occasionProductLaunch: string;
    occasionOther: string;
    cta: string;
  };
  eventReplied: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    responseLabel: string;
    cta: string;
  };
  eventQuoted: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    amountLabel: string;
    expiresLabel: string;
    cta: string;
    currency: string;
  };
  eventAccepted: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    amountLabel: string;
    cta: string;
    currency: string;
  };
  eventDeclined: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    reasonLabel: string;
    reasonNoAvailability: string;
    reasonOutOfCapacity: string;
    reasonBudgetMismatch: string;
    reasonOther: string;
    cta: string;
  };
  eventExpired: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    cta: string;
  };
  eventNudge: {
    subject: string;
    preview: string;
    title: string;
    subtitle: string;
    detailsLabel: string;
    cta: string;
  };
}

/** Structural contract for the `partner.common` namespace (shell chrome). */
export interface PartnerCommonMessages {
  nav: {
    eyebrow: string;
    /** Back-link shown on standalone account pages (marketing, billing, org). */
    backToDashboard: string;
    /** Eyebrow above the page title on standalone account pages. */
    accountEyebrow: string;
    signOut: string;
    openMenu: string;
    closeMenu: string;
    openRequestsBadge: PluralBag;
    items: {
      dashboard: string;
      profile: string;
      hours: string;
      photos: string;
      menu: string;
      translations: string;
      availability: string;
      reservations: string;
      floor: string;
      staff: string;
      diners: string;
      reviews: string;
      corporate: string;
      spaces: string;
      marketing: string;
      org: string;
      billing: string;
      preview: string;
    };
  };
  bell: {
    ariaLabel: string;
    empty: string;
    kinds: {
      new_event_request: string;
      event_request_replied: string;
      event_request_quoted: string;
      quote_accepted: string;
      quote_declined: string;
      event_request_cancelled: string;
    };
  };
  /** Generic action errors shared across partner server actions. */
  errors: {
    notAuthenticated: string;
    noRestaurant: string;
  };
  /** Comma-joined short weekday/month names for locale-aware date labels. */
  dateFormat: {
    weekdaysShort: string;
    monthsShort: string;
  };
}

/** Structural contract for the `partner.reservations` namespace. */
export interface PartnerReservationsMessages {
  page: { title: string; subtitle: string; noRestaurant: string };
  tabs: { today: string; upcoming: string; past: string };
  status: {
    confirmed: string;
    seated: string;
    completed: string;
    cancelled: string;
    no_show: string;
  };
  table: {
    when: string;
    client: string;
    party: string;
    zone: string;
    status: string;
    actions: string;
  };
  empty: {
    today: string;
    upcoming: string;
    past: string;
    pastHint: string;
    defaultHint: string;
  };
  actions: { seat: string; noShow: string; cancel: string; complete: string };
  toast: {
    seated: string;
    noShow: string;
    completed: string;
    updateFailed: string;
  };
  cancel: {
    title: string;
    summaryParty: string;
    reasonsTitle: string;
    reasons: {
      restaurant_closed: string;
      overbooked: string;
      kitchen_issue: string;
      private_event: string;
      other: string;
    };
    reasonsHint: string;
    keep: string;
    submitPending: string;
    submit: string;
    toastCancelled: string;
    toastCancelledNoEmail: string;
    cancelFailed: string;
  };
  errors: {
    noPermissionAction: string;
    invalidReason: string;
    noPermissionCancel: string;
    notFound: string;
    onlyConfirmed: string;
  };
}

/** Structural contract for the `partner.menu` namespace. */
export interface PartnerMenuMessages {
  page: { title: string; subtitle: string; noRestaurant: string };
  printQr: { disabledTitle: string; label: string };
  qr: {
    title: string;
    subtitle: string;
    noCity: string;
    layoutLabel: string;
    single: string;
    sheet: string;
    print: string;
  };
  editor: {
    emptyTitle: string;
    emptyBody1: string;
    addFirstSection: string;
    addSection: string;
    addItem: string;
    collapse: string;
    expand: string;
    editSection: string;
    deleteSection: string;
    editItem: string;
    deleteItem: string;
    unavailable: string;
    itemCount: PluralBag;
    price: string;
    confirmDeleteSection: string;
    confirmDeleteItem: string;
  };
  sectionDialog: {
    titleNew: string;
    titleEdit: string;
    close: string;
    nameLabel: string;
    namePlaceholder: string;
    introLabel: string;
    introPlaceholder: string;
    cancel: string;
    saving: string;
    create: string;
    save: string;
    genericError: string;
  };
  itemDialog: {
    titleNew: string;
    titleEdit: string;
    close: string;
    nameLabel: string;
    namePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    priceLabel: string;
    pricePlaceholder: string;
    available: string;
    tagsLabel: string;
    tags: {
      vegetarian: string;
      vegan: string;
      gluten_free: string;
      spicy: string;
      popular: string;
    };
    chefPick: string;
    cancel: string;
    saving: string;
    saveChanges: string;
    addItem: string;
    genericError: string;
  };
  errors: {
    sectionNameRequired: string;
    chooseSection: string;
    invalidItemRef: string;
    nameRequired: string;
    priceNonNegative: string;
  };
}

/** Structural contract for the `partner.tables` namespace. */
export interface PartnerTablesMessages {
  page: {
    title: string;
    subtitlePrefix: string;
    subtitleSuffix: string;
    noRestaurant: string;
  };
  live: {
    title: string;
    freeNow: PluralBag;
    now: string;
    totalSuffix: string;
    editPlan: string;
    noAccess: string;
  };
  status: {
    free: string;
    booked: string;
    seated: string;
    paying: string;
    dirty: string;
    combined: string;
    blocked: string;
  };
  liveFloor: {
    noSection: string;
    combineCancel: string;
    combineStart: string;
    combineSelection: string;
    selected: string;
    select: string;
    dissolve: string;
    transitionTo: string;
    clearReasonPrompt: string;
    errorInvalidTransition: string;
    errorFailed: string;
  };
  reservationsPanel: {
    title: string;
    empty: string;
    party: PluralBag;
    pickTableAriaLabel: string;
    pickTablePlaceholder: string;
    tableOption: string;
    seat: string;
  };
  walkinPanel: {
    title: string;
    namePlaceholder: string;
    partyAriaLabel: string;
    phonePlaceholder: string;
    add: string;
    empty: string;
    party: string;
    statusCalled: string;
    statusWaiting: string;
    waitSuffix: string;
    call: string;
    seat: string;
    left: string;
  };
  floorPlan: {
    toggleLayout: string;
    toggleTonight: string;
    tonightSummary: string;
    free: string;
    seatCount: string;
    entrance: string;
    toastUpdateFailed: string;
    toastAddFailed: string;
    toastDeleteFailed: string;
  };
  emptyInspector: {
    title: string;
    body: string;
    addTable: string;
    dragHint: string;
  };
  editInspector: {
    title: string;
    deleteTableAriaLabel: string;
    labelLabel: string;
    sectionLabel: string;
    shapeLabel: string;
    shapeRound: string;
    shapeSquare: string;
    capacityLabel: string;
    capacityUnit: string;
    bookableOnline: string;
    bookableOnlineHint: string;
  };
  tonightInspector: {
    title: string;
    summary: string;
    empty: string;
    guestParty: string;
  };
  sections: {
    heading: string;
    newSection: string;
    nameRequired: string;
    deleteConfirm: string;
    editAriaLabel: string;
    deleteAriaLabel: string;
    form: {
      nameLabel: string;
      namePlaceholder: string;
      colorLabel: string;
      colorOptional: string;
      colorPlaceholder: string;
      sortOrderLabel: string;
      cancel: string;
      saving: string;
      save: string;
      add: string;
    };
  };
}

/** Structural contract for the `partner.diners` namespace. */
export interface PartnerDinersMessages {
  list: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    searchSubmit: string;
    reset: string;
    noRestaurant: string;
    noAccess: string;
    table: { guest: string; contact: string; visits: string; lastVisit: string };
    emptySearch: string;
    empty: string;
    maskedHint: string;
  };
  detail: {
    back: string;
    fallbackName: string;
    visits: PluralBag;
    lastVisit: string;
    preferencesTitle: string;
    historyTitle: string;
    history: { date: string; venue: string; party: string; status: string };
    noVisits: string;
  };
  bucket: {
    first_timer: string;
    occasional: string;
    regular: string;
    vip: string;
    lapsed: string;
  };
  status: {
    confirmed: string;
    completed: string;
    cancelled: string;
    no_show: string;
    seated: string;
  };
  form: {
    birthday: string;
    anniversary: string;
    occasions: string;
    occasionsPlaceholder: string;
    allergies: string;
    allergiesPlaceholder: string;
    dietary: string;
    dietaryPlaceholder: string;
    notes: string;
    saving: string;
    save: string;
    saved: string;
    saveFailed: string;
    errors: { billing_locked: string; forbidden: string };
  };
}

/** Structural contract for the `partner.marketing` namespace. */
export interface PartnerMarketingMessages {
  page: {
    title: string;
    noAccess: string;
    proGateTitle: string;
    proGateBody: string;
    proGateCta: string;
    quotaOver: string;
    quotaNear: string;
    quotaSurcharge: string;
    usageTitle: string;
    usageHint: string;
    segmentsLink: string;
  };
  channels: {
    email: string;
    sms: string;
    whatsapp: string;
    in_confirmation: string;
  };
  triggeredLabels: {
    post_visit_review: string;
    pre_arrival: string;
    birthday_anniversary: string;
    lapsed_60: string;
    lapsed_120: string;
    lapsed_180: string;
    no_show_followup: string;
    welcome_series: string;
  };
  manager: {
    actionFailed: string;
    triggeredTitle: string;
    triggeredSubtitle: string;
    toggleOn: string;
    toggleOff: string;
    toggleAriaLabel: string;
    campaignStopped: string;
    campaignStarted: string;
    triggeredEmpty: string;
    oneOffTitle: string;
    newCampaign: string;
    cancel: string;
    send: string;
    sent: string;
    archive: string;
    archived: string;
    oneOffEmpty: string;
  };
  newCampaign: {
    templateLabel: string;
    templateAriaLabel: string;
    templateNone: string;
    namePlaceholder: string;
    channelAriaLabel: string;
    subjectPlaceholder: string;
    bodyPlaceholderRequired: string;
    bodyPlaceholderOptional: string;
    submit: string;
    created: string;
    errorInvalidInput: string;
    errorGeneric: string;
    localeNames: { ro: string; en: string; de: string };
  };
  segments: {
    title: string;
    subtitle: string;
    savedTitle: string;
    savedSize: string;
    savedSizeEmpty: string;
  };
  builder: {
    matchPrefix: string;
    combinatorAriaLabel: string;
    combinatorAll: string;
    combinatorAny: string;
    dimensionAriaLabel: string;
    dimensions: {
      recency: string;
      frequency: string;
      party_size: string;
      occasion: string;
      channel: string;
    };
    recencyModeAriaLabel: string;
    recencyWithin: string;
    recencyNotWithin: string;
    daysAriaLabel: string;
    daysSuffix: string;
    bucketPlaceholder: string;
    bucketAriaLabel: string;
    minPlaceholder: string;
    minAriaLabel: string;
    maxPlaceholder: string;
    maxAriaLabel: string;
    tagPlaceholder: string;
    tagAriaLabel: string;
    sourcePlaceholder: string;
    sourceAriaLabel: string;
    removeConditionAriaLabel: string;
    addCondition: string;
    estimateSize: string;
    sizeResult: PluralBag;
    nameAriaLabel: string;
    namePlaceholder: string;
    save: string;
    saved: string;
    errorPreviewInvalid: string;
    errorPreviewGeneric: string;
    errorSaveInvalid: string;
    errorSaveGeneric: string;
  };
  errors: {
    atLeastOneCondition: string;
    segmentNameRequired: string;
  };
}

/** Structural contract for the `partner.analytics` namespace. */
export interface PartnerAnalyticsMessages {
  page: { noVenue: string };
  view: {
    eyebrow: string;
    subtitlePro: string;
    subtitleBase: string;
    exportData: string;
    emptyTitle: string;
    emptyBody: string;
    delta: { up: string; down: string; unchanged: string };
    stats: { bookings: string; covers: string; completed: string; noShows: string };
    proTitle: string;
    proGate: { title: string; body: string; cta: string };
  };
  charts: {
    coversPerService: { kicker: string; title: string; empty: string; seriesCovers: string };
    noShowTrend: { kicker: string; title: string; empty: string; seriesRate: string };
    partyMix: { kicker: string; title: string; empty: string; seriesBookings: string };
    cancellations: { kicker: string; title: string; empty: string };
    heatMap: { kicker: string; title: string; empty: string; noData: string; cellTitle: string };
    cohort: { kicker: string; title: string; empty: string; header: string };
    leadTime: { kicker: string; title: string; empty: string; seriesMedian: string; seriesP90: string };
    channel: { kicker: string; title: string; empty: string; seriesBookings: string };
    forecast: { kicker: string; title: string; empty: string; seriesPredicted: string; seriesConfirmed: string };
  };
  chartKit: { smallSample: string };
  serviceLabels: Record<string, string>;
  cancelReasons: Record<string, string>;
  channels: Record<string, string>;
  export: {
    eyebrow: string;
    title: string;
    close: string;
    doneTitle: string;
    doneBody: string;
    doneAck: string;
    dateFrom: string;
    dateTo: string;
    includeLegend: string;
    reservationsAlways: string;
    tables: { diners: string; reviews: string };
    genericError: string;
    cancel: string;
    submitting: string;
    submit: string;
  };
}

/**
 * Registry of namespaces. Each entry is Record<Locale, NsMessages>, so a missing
 * key in any locale is a TypeScript error at build time (the locked completeness
 * contract). Add new namespaces here as later phases extract strings.
 */
const CATALOGS = {
  common: { ro: roCommon, en: enCommon, de: deCommon } as Record<
    Locale,
    CommonMessages
  >,
  discovery: { ro: roDiscovery, en: enDiscovery, de: deDiscovery } as Record<
    Locale,
    DiscoveryMessages
  >,
  restaurant: { ro: roRestaurant, en: enRestaurant, de: deRestaurant } as Record<
    Locale,
    RestaurantMessages
  >,
  menu: { ro: roMenu, en: enMenu, de: deMenu } as Record<
    Locale,
    MenuMessages
  >,
  booking: { ro: roBooking, en: enBooking, de: deBooking } as Record<
    Locale,
    BookingMessages
  >,
  reviews: { ro: roReviews, en: enReviews, de: deReviews } as Record<
    Locale,
    ReviewsMessages
  >,
  events: { ro: roEvents, en: enEvents, de: deEvents } as Record<
    Locale,
    EventsMessages
  >,
  profile: { ro: roProfile, en: enProfile, de: deProfile } as Record<
    Locale,
    ProfileMessages
  >,
  emails: { ro: roEmails, en: enEmails, de: deEmails } as Record<
    Locale,
    EmailsMessages
  >,
  "partner.common": {
    ro: roPartnerCommon,
    en: enPartnerCommon,
    de: dePartnerCommon,
  } as Record<Locale, PartnerCommonMessages>,
  "partner.reservations": {
    ro: roPartnerReservations,
    en: enPartnerReservations,
    de: dePartnerReservations,
  } as Record<Locale, PartnerReservationsMessages>,
  "partner.menu": {
    ro: roPartnerMenu,
    en: enPartnerMenu,
    de: dePartnerMenu,
  } as Record<Locale, PartnerMenuMessages>,
  "partner.tables": {
    ro: roPartnerTables,
    en: enPartnerTables,
    de: dePartnerTables,
  } as Record<Locale, PartnerTablesMessages>,
  "partner.diners": {
    ro: roPartnerDiners,
    en: enPartnerDiners,
    de: dePartnerDiners,
  } as Record<Locale, PartnerDinersMessages>,
  "partner.marketing": {
    ro: roPartnerMarketing,
    en: enPartnerMarketing,
    de: dePartnerMarketing,
  } as Record<Locale, PartnerMarketingMessages>,
  "partner.analytics": {
    ro: roPartnerAnalytics,
    en: enPartnerAnalytics,
    de: dePartnerAnalytics,
  } as Record<Locale, PartnerAnalyticsMessages>,
} as const;

export type Namespace = keyof typeof CATALOGS;
export const NAMESPACES = Object.keys(CATALOGS) as Namespace[];

type NsMessages<N extends Namespace> = (typeof CATALOGS)[N][Locale];

/** Server-side: return the typed namespace object for `locale` (RO fallback). */
export function getMessages<N extends Namespace>(
  locale: string,
  ns: N,
): NsMessages<N> {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return CATALOGS[ns][l];
}

/** Assemble a client-provider bundle for the given namespaces. */
export function buildBundle(
  locale: string,
  namespaces: Namespace[],
): Record<string, Record<string, unknown>> {
  const bundle: Record<string, Record<string, unknown>> = {};
  for (const ns of namespaces)
    bundle[ns] = getMessages(locale, ns) as unknown as Record<string, unknown>;
  return bundle;
}
