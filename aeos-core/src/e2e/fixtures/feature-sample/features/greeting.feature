Feature: Sample greeting

  @AC-1
  Scenario: A visitor with no saved name
    Given a visitor with no saved name
    When the greeting is shown
    Then it reads "Hello, there"
