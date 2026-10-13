package io.example.api.model

import java.util.Objects
import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonValue
import io.example.api.model.WidgetStatus
import javax.validation.constraints.DecimalMax
import javax.validation.constraints.DecimalMin
import javax.validation.constraints.Email
import javax.validation.constraints.Max
import javax.validation.constraints.Min
import javax.validation.constraints.NotNull
import javax.validation.constraints.Pattern
import javax.validation.constraints.Size
import javax.validation.Valid

/**
 * 
 * @param id 
 * @param name 
 * @param status 
 */
data class Widget(

    @param:JsonProperty("id", required = true)
    @get:JsonProperty("id", required = true) val id: java.util.UUID,

    @param:JsonProperty("name", required = true)
    @get:JsonProperty("name", required = true) val name: kotlin.String,

    @field:Valid
    @param:JsonProperty("status", required = true)
    @get:JsonProperty("status", required = true) val status: WidgetStatus
) {

}

