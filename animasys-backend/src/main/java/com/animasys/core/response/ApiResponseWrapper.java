package com.animasys.core.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponseWrapper<T> {
    private boolean success;
    private String message;
    private T data;
    private long timestamp;

    public static <T> ApiResponseWrapper<T> success(T data, String message) {
        return ApiResponseWrapper.<T>builder()
                .success(true)
                .message(message)
                .data(data)
                .timestamp(Instant.now().getEpochSecond())
                .build();
    }

    public static <T> ApiResponseWrapper<T> success(T data) {
        return success(data, "Operation completed successfully");
    }

    public static <T> ApiResponseWrapper<T> error(String message) {
        return ApiResponseWrapper.<T>builder()
                .success(false)
                .message(message)
                .data(null)
                .timestamp(Instant.now().getEpochSecond())
                .build();
    }
}
